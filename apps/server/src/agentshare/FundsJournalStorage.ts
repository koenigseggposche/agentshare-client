// @effect-diagnostics nodeBuiltinImport:off -- The payment journal needs SQLite's durable commit before an HTTP write.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import { FundsJournalStorage } from "@agentshare/account-client/FundsJournal";
import { AgentShareAccountError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";

const applicationId = 0x4153464a;

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** @internal */
export function layerForDirectory(directory: string) {
  const filename = NodePath.join(directory, "funds.sqlite");
  const withDatabase = Effect.fn("FundsJournalStorage.withDatabase")(
    <A>(operation: (database: NodeSqlite.DatabaseSync) => A) =>
      Effect.tryPromise({
        try: async () => {
          await NodeFSP.mkdir(directory, { recursive: true, mode: 0o700 });
          const parent = await NodeFSP.lstat(directory);
          if (!parent.isDirectory() || parent.isSymbolicLink())
            throw new Error("Invalid journal directory");
          await NodeFSP.chmod(directory, 0o700);
          try {
            const file = await NodeFSP.open(filename, "wx", 0o600);
            await file.close();
          } catch (error) {
            if (
              !(
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "EEXIST"
              )
            )
              throw error;
          }
          const file = await NodeFSP.lstat(filename);
          if (!file.isFile() || file.isSymbolicLink()) throw new Error("Invalid journal file");
          await NodeFSP.chmod(filename, 0o600);
          const database = new NodeSqlite.DatabaseSync(filename);
          try {
            database.exec(
              "PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON;",
            );
            database.exec("BEGIN IMMEDIATE");
            const version = database.prepare("PRAGMA user_version").get()?.user_version;
            const app = database.prepare("PRAGMA application_id").get()?.application_id;
            if (version === 0 && app === 0) {
              const tables = database
                .prepare(
                  "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                )
                .all();
              if (tables.length !== 0) throw new Error("Unrecognized journal schema");
              database.exec(`CREATE TABLE IF NOT EXISTS fund_journal(singleton INTEGER PRIMARY KEY CHECK(singleton=1), snapshot TEXT NOT NULL) STRICT;
                PRAGMA application_id=${applicationId}; PRAGMA user_version=1;`);
            } else if (version !== 1 || app !== applicationId)
              throw new Error("Unsupported journal schema");
            database.exec("COMMIT");
            return operation(database);
          } finally {
            database.close();
          }
        },
        catch: (cause) =>
          new AgentShareAccountError({
            operation: "funds-storage",
            category: "unavailable",
            cause,
          }),
      }),
  );
  return Layer.succeed(FundsJournalStorage, {
    load: Effect.fn("FundsJournalStorage.load")(function* () {
      const exists = yield* Effect.tryPromise({
        try: () =>
          NodeFSP.lstat(filename)
            .then(() => true)
            .catch((error: unknown) => {
              if (missing(error)) return false;
              throw error;
            }),
        catch: (cause) =>
          new AgentShareAccountError({
            operation: "funds-storage",
            category: "unavailable",
            cause,
          }),
      });
      if (!exists) return null;
      return yield* withDatabase((database) => {
        const row = database.prepare("SELECT snapshot FROM fund_journal WHERE singleton=1").get();
        if (row === undefined) return null;
        if (typeof row.snapshot !== "string") throw new Error("Invalid journal snapshot");
        return row.snapshot;
      });
    }),
    save: Effect.fn("FundsJournalStorage.save")((value, expected) =>
      withDatabase((database) => {
        database.exec("BEGIN IMMEDIATE");
        const row = database.prepare("SELECT snapshot FROM fund_journal WHERE singleton=1").get();
        if ((row?.snapshot ?? null) !== expected)
          throw new Error("Journal changed; refresh before submitting");
        database
          .prepare(
            "INSERT INTO fund_journal(singleton,snapshot) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET snapshot=excluded.snapshot",
          )
          .run(value);
        database.exec("COMMIT");
      }),
    ),
  });
}

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return layerForDirectory(NodePath.join(config.baseDir, "agentshare-funds"));
  }),
);
