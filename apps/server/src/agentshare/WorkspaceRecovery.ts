// @effect-diagnostics nodeBuiltinImport:off - Recovery snapshots SQLite before atomically publishing an account directory.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeSqlite from "node:sqlite";

import * as Schema from "effect/Schema";

export class WorkspaceRecoveryError extends Schema.TaggedError<WorkspaceRecoveryError>()(
  "WorkspaceRecoveryError",
  { detail: Schema.String },
) {
  override get message() {
    return this.detail;
  }
}

function legacyOwners(value: unknown): Set<string> {
  const owners = new Set<string>();
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (entry === null || typeof entry !== "object") return;
    for (const [key, item] of Object.entries(entry)) {
      if (key === "agentShareOwner" && typeof item === "string" && item !== "") owners.add(item);
      else visit(item);
    }
  };
  visit(value);
  return owners;
}

function hasHistory(database: string): boolean {
  if (!NodeFS.existsSync(database)) return false;
  const db = new NodeSqlite.DatabaseSync(database, { readOnly: true });
  try {
    for (const name of [
      "orchestration_v2_projection_threads",
      "projection_threads",
      "orchestration_v2_projection_projects",
      "projection_projects",
      "orchestration_v2_events",
    ]) {
      if (
        db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) &&
        db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).get()
      )
        return true;
    }
    return false;
  } finally {
    db.close();
  }
}

function copyTree(source: string, target: string) {
  const stat = NodeFS.lstatSync(source);
  if (stat.isSymbolicLink())
    throw new WorkspaceRecoveryError({
      detail: "Workspace recovery refuses symbolic links; restore these files explicitly.",
    });
  if (stat.isDirectory()) {
    NodeFS.mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const name of NodeFS.readdirSync(source))
      copyTree(NodePath.join(source, name), NodePath.join(target, name));
  } else if (stat.isFile()) NodeFS.copyFileSync(source, target, NodeFS.constants.COPYFILE_EXCL);
}

type RecoveryInput = {
  readonly baseDir: string;
  readonly stateDir: string;
  readonly accountDir: string;
  readonly owner: string;
  readonly explicit?: boolean;
};

export async function recoverAccountWorkspace(input: RecoveryInput): Promise<boolean> {
  if (!NodeFS.existsSync(NodePath.join(input.stateDir, "statev2.sqlite"))) return false;
  const lock = NodePath.join(input.stateDir, "account-workspace-recovery.lock");
  const lockFd = NodeFS.openSync(lock, "wx", 0o600);
  try {
    NodeFS.writeFileSync(lockFd, String(process.pid));
    return await recoverLocked(input);
  } finally {
    NodeFS.closeSync(lockFd);
    NodeFS.unlinkSync(lock);
  }
}

async function recoverLocked(input: RecoveryInput): Promise<boolean> {
  const source = input.stateDir;
  const sourceDb = NodePath.join(source, "statev2.sqlite");
  const target = NodePath.join(input.accountDir, NodePath.basename(source));
  const targetDb = NodePath.join(target, "statev2.sqlite");
  if (!NodeFS.existsSync(sourceDb)) return false;
  const claim = NodePath.join(source, "account-workspace-recovery.json");
  const ownerHash = NodeCrypto.createHash("sha256").update(input.owner).digest("hex");
  if (NodeFS.existsSync(claim)) {
    const prior = JSON.parse(NodeFS.readFileSync(claim, "utf8")) as { ownerHash: string };
    if (prior.ownerHash !== ownerHash) return false;
    if (NodeFS.existsSync(targetDb)) return false;
  }
  if (!hasHistory(sourceDb)) return false;
  if (hasHistory(targetDb)) {
    const sourceIdentity = NodePath.join(source, "environment-id");
    const targetIdentity = NodePath.join(target, "environment-id");
    if (
      NodeFS.existsSync(sourceIdentity) &&
      NodeFS.existsSync(targetIdentity) &&
      NodeFS.readFileSync(sourceIdentity, "utf8").trim() !== "" &&
      NodeFS.readFileSync(sourceIdentity, "utf8") === NodeFS.readFileSync(targetIdentity, "utf8")
    ) {
      if (!NodeFS.existsSync(claim))
        NodeFS.writeFileSync(
          claim,
          JSON.stringify({ ownerHash, accountDir: input.accountDir }) + "\n",
          { flag: "wx", mode: 0o600 },
        );
    } else if (input.explicit) {
      throw new WorkspaceRecoveryError({
        detail:
          "The current account already contains history. Recovery will not overwrite or merge it.",
      });
    }
    return false;
  }
  const settingsPath = NodePath.join(source, "settings.json");
  const owners = legacyOwners(
    NodeFS.existsSync(settingsPath) ? JSON.parse(NodeFS.readFileSync(settingsPath, "utf8")) : {},
  );
  if (!input.explicit && (owners.size !== 1 || !owners.has(input.owner))) {
    throw new WorkspaceRecoveryError({
      detail:
        "Existing workbench history needs an account assignment. Stop this workbench, then run agentshare-client doctor --recover-workspace --base-dir " +
        "'" +
        input.baseDir.replaceAll("'", "'\"'\"'") +
        "'" +
        " while signed in to the intended account. Original history has not been changed.",
    });
  }
  const runtimePath = NodePath.join(source, "server-runtime.json");
  if (NodeFS.existsSync(runtimePath)) {
    const runtime = JSON.parse(NodeFS.readFileSync(runtimePath, "utf8")) as { pid?: number };
    if (runtime.pid && runtime.pid !== process.pid) {
      let alive = true;
      try {
        process.kill(runtime.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (alive)
        throw new WorkspaceRecoveryError({
          detail: "Stop the workbench before recovering its history. No files changed.",
        });
    }
  }
  let stage: string | undefined;
  const retained = `${input.accountDir}.before-recovery-${NodeCrypto.randomUUID()}`;
  let movedTarget = false;
  let published = false;
  try {
    const parent = NodePath.dirname(input.accountDir);
    NodeFS.mkdirSync(parent, { recursive: true, mode: 0o700 });
    stage = NodeFS.mkdtempSync(NodePath.join(parent, ".recover-"));
    const stagedState = NodePath.join(stage, NodePath.basename(source));
    NodeFS.mkdirSync(stagedState, { mode: 0o700 });
    const db = new NodeSqlite.DatabaseSync(sourceDb, { readOnly: true });
    try {
      await NodeSqlite.backup(db, NodePath.join(stagedState, "statev2.sqlite"));
    } finally {
      db.close();
    }
    for (const name of [
      "environment-id",
      "settings.json",
      "keybindings.json",
      "attachments",
      "browser-artifacts",
      "themes",
      "secrets",
    ]) {
      const item = NodePath.join(source, name);
      if (NodeFS.existsSync(item)) copyTree(item, NodePath.join(stagedState, name));
    }
    for (const name of ["worktrees", "caches"]) {
      const item = NodePath.join(input.baseDir, name);
      if (NodeFS.existsSync(item)) copyTree(item, NodePath.join(stage, name));
    }
    if (NodeFS.existsSync(input.accountDir)) {
      NodeFS.renameSync(input.accountDir, retained);
      movedTarget = true;
    }
    NodeFS.renameSync(stage, input.accountDir);
    published = true;
    const nextClaim = `${claim}.${NodeCrypto.randomUUID()}`;
    NodeFS.writeFileSync(
      nextClaim,
      JSON.stringify({ ownerHash, accountDir: input.accountDir }) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    NodeFS.renameSync(nextClaim, claim);
    return true;
  } finally {
    if (!published && movedTarget) NodeFS.renameSync(retained, input.accountDir);
    if (stage !== undefined) NodeFS.rmSync(stage, { recursive: true, force: true });
  }
}
