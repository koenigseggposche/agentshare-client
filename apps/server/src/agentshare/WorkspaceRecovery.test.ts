// @effect-diagnostics nodeBuiltinImport:off - Generated on-disk SQLite fixtures exercise real recovery snapshots.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";

import { recoverAccountWorkspace } from "./WorkspaceRecovery.ts";

function fixture(owners = ["account-a"]) {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "workspace-recovery-"));
  const stateDir = NodePath.join(root, "userdata");
  NodeFS.mkdirSync(stateDir);
  const db = new NodeSqlite.DatabaseSync(NodePath.join(stateDir, "statev2.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT); INSERT INTO orchestration_v2_projection_threads VALUES ('generated-thread')",
  );
  NodeFS.writeFileSync(
    NodePath.join(stateDir, "settings.json"),
    JSON.stringify({
      providerInstances: owners.map((agentShareOwner) => ({ settings: { agentShareOwner } })),
    }),
  );
  NodeFS.writeFileSync(NodePath.join(stateDir, "environment-id"), "generated-environment");
  NodeFS.mkdirSync(NodePath.join(stateDir, "attachments"));
  NodeFS.writeFileSync(
    NodePath.join(stateDir, "attachments", "example.txt"),
    "generated attachment",
  );
  return {
    input: {
      baseDir: root,
      stateDir,
      accountDir: NodePath.join(root, "accounts", "account-a"),
      owner: "account-a",
    },
    [Symbol.dispose]() {
      db.close();
      NodeFS.rmSync(root, { recursive: true, force: true });
    },
  };
}

function ids(file: string) {
  const db = new NodeSqlite.DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare("SELECT thread_id FROM orchestration_v2_projection_threads")
      .all()
      .map((row) => row.thread_id);
  } finally {
    db.close();
  }
}

describe("account workspace recovery", () => {
  it("snapshots WAL history and attachments, preserves identity, and never copies history to another account", async () => {
    using f = fixture();
    expect(await recoverAccountWorkspace(f.input)).toBe(true);
    const target = NodePath.join(f.input.accountDir, "userdata");
    expect(ids(NodePath.join(target, "statev2.sqlite"))).toEqual(["generated-thread"]);
    expect(NodeFS.readFileSync(NodePath.join(target, "environment-id"), "utf8")).toBe(
      "generated-environment",
    );
    expect(NodeFS.readFileSync(NodePath.join(target, "attachments/example.txt"), "utf8")).toBe(
      "generated attachment",
    );
    expect(ids(NodePath.join(f.input.stateDir, "statev2.sqlite"))).toEqual(["generated-thread"]);
    expect(await recoverAccountWorkspace(f.input)).toBe(false);
    const other = {
      ...f.input,
      owner: "account-b",
      accountDir: NodePath.join(f.input.baseDir, "accounts/account-b"),
      explicit: true,
    };
    expect(await recoverAccountWorkspace(other)).toBe(false);
    expect(NodeFS.existsSync(other.accountDir)).toBe(false);
  });

  it("requires an explicit account assignment for mixed or missing ownership", async () => {
    using f = fixture(["account-a", "account-b"]);
    await expect(recoverAccountWorkspace(f.input)).rejects.toThrow("needs an account assignment");
    expect(NodeFS.existsSync(f.input.accountDir)).toBe(false);
    expect(await recoverAccountWorkspace({ ...f.input, explicit: true })).toBe(true);
  });

  it("does not replace an account that already has conversations", async () => {
    using f = fixture();
    const target = NodePath.join(f.input.accountDir, "userdata");
    NodeFS.mkdirSync(target, { recursive: true });
    const db = new NodeSqlite.DatabaseSync(NodePath.join(target, "statev2.sqlite"));
    db.exec(
      "CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT); INSERT INTO orchestration_v2_projection_threads VALUES ('existing-thread')",
    );
    db.close();
    await expect(recoverAccountWorkspace({ ...f.input, explicit: true })).rejects.toThrow(
      "already contains history",
    );
    expect(ids(NodePath.join(target, "statev2.sqlite"))).toEqual(["existing-thread"]);
  });

  it("leaves the empty target and original source intact on a failed copy, then permits retry", async () => {
    using f = fixture();
    NodeFS.mkdirSync(f.input.accountDir, { recursive: true });
    NodeFS.writeFileSync(NodePath.join(f.input.accountDir, "retained.txt"), "retained");
    const link = NodePath.join(f.input.stateDir, "attachments/link");
    NodeFS.symlinkSync(NodePath.join(f.input.stateDir, "attachments/example.txt"), link);
    await expect(recoverAccountWorkspace(f.input)).rejects.toThrow("symbolic links");
    expect(NodeFS.readFileSync(NodePath.join(f.input.accountDir, "retained.txt"), "utf8")).toBe(
      "retained",
    );
    expect(
      NodeFS.existsSync(NodePath.join(f.input.stateDir, "account-workspace-recovery.lock")),
    ).toBe(false);
    NodeFS.unlinkSync(link);
    expect(await recoverAccountWorkspace(f.input)).toBe(true);
    expect(
      NodeFS.readdirSync(NodePath.dirname(f.input.accountDir)).some((name) =>
        name.includes("before-recovery"),
      ),
    ).toBe(true);
  });

  it("refuses recovery while another workbench process is alive", async () => {
    using f = fixture();
    NodeFS.writeFileSync(
      NodePath.join(f.input.stateDir, "server-runtime.json"),
      JSON.stringify({ pid: 1 }),
    );
    await expect(recoverAccountWorkspace(f.input)).rejects.toThrow("Stop the workbench");
    expect(NodeFS.existsSync(f.input.accountDir)).toBe(false);
  });
});
