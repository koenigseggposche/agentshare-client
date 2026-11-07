// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "./Sqlite.ts";
import * as ServerConfig from "../config.ts";
import * as WorkspaceAccount from "../agentshare/WorkspaceAccount.ts";

it.effect("keeps each account's workbench database separate when reopening the same host", () => {
  const fixtures = NodePath.resolve(import.meta.dirname, "../../../../.t3/fixtures");
  NodeFS.mkdirSync(fixtures, { recursive: true });
  const directory = NodeFS.mkdtempSync(NodePath.join(fixtures, "account-"));
  const persistence = (owner: string) =>
    SqlitePersistence.layerConfig.pipe(
      Layer.provideMerge(
        WorkspaceAccount.layerFromCore.pipe(
          Layer.provide(
            Layer.effect(
              ServerConfig.ServerConfig,
              Effect.gen(function* () {
                const config = yield* ServerConfig.ServerConfig;
                return ServerConfig.make({
                  ...config,
                  otlpTracesUrl: "https://previous.example.test/traces",
                  otlpMetricsUrl: "https://previous.example.test/metrics",
                  otlpLogsUrl: "https://previous.example.test/logs",
                  otlpTracesSource: "settings",
                  otlpMetricsSource: "settings",
                  otlpLogsSource: "settings",
                });
              }),
            ).pipe(Layer.provide(ServerConfig.layerTest(directory, directory))),
          ),
          Layer.provide(
            Layer.mock(CoreClient.CoreClient)({
              identity: () =>
                Effect.succeed({
                  api_version: 1,
                  version: "generated",
                  revision: "generated",
                  owner,
                  account_generation: 1,
                  device_id: "generated-device",
                  paired: owner !== "offline",
                  stopping: false,
                  features: [],
                }),
            }),
          ),
        ),
      ),
      Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
    );
  const inspect = (owner: string, expected: readonly string[], insert?: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const paths = [
        NodePath.join(config.attachmentsDir, "generated-attachment.txt"),
        NodePath.join(config.secretsDir, "generated-secret-fixture.txt"),
        NodePath.join(config.providerStatusCacheDir, "generated-cache.txt"),
      ];
      assert.equal(config.baseDir, directory);
      assert.equal(
        config.serverRuntimeStatePath,
        NodePath.join(directory, "userdata/server-runtime.json"),
      );
      assert.equal(
        config.otlpTracesUrl,
        expected.length > 0 ? `https://${owner}.example.test/traces` : undefined,
      );
      assert.isUndefined(config.otlpMetricsUrl);
      assert.isUndefined(config.otlpLogsUrl);
      assert.equal(yield* fs.exists(config.settingsPath), expected.length > 0);
      if (insert !== undefined)
        yield* fs.writeFileString(
          config.settingsPath,
          JSON.stringify({
            observability: { otlpTracesUrl: `https://${owner}.example.test/traces` },
          }),
        );
      for (const file of paths) {
        assert.equal(yield* fs.exists(file), expected.length > 0);
        if (expected.length > 0) assert.equal(yield* fs.readFileString(file), expected[0]);
        if (insert !== undefined) {
          yield* fs.makeDirectory(NodePath.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, insert);
        }
      }
      yield* sql`CREATE TABLE IF NOT EXISTS generated_history(value TEXT NOT NULL)`;
      const rows = yield* sql<{ readonly value: string }>`SELECT value FROM generated_history`;
      assert.deepEqual(
        rows.map((row) => row.value),
        expected,
      );
      if (insert !== undefined) yield* sql`INSERT INTO generated_history VALUES (${insert})`;
    }).pipe(Effect.provide(persistence(owner)));
  return Effect.gen(function* () {
    yield* inspect("generated-account-a", [], "first account's work");
    yield* inspect("generated-account-b", [], "second account's work");
    yield* inspect("offline", [], "offline work");
    yield* inspect("generated-account-a", ["first account's work"]);
    yield* inspect("generated-account-b", ["second account's work"]);
    yield* inspect("offline", ["offline work"]);
  }).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true }))),
  );
});

it.effect("does not open offline history when the current account cannot be verified", () => {
  const fixtures = NodePath.resolve(import.meta.dirname, "../../../../.t3/fixtures");
  NodeFS.mkdirSync(fixtures, { recursive: true });
  const directory = NodeFS.mkdtempSync(NodePath.join(fixtures, "account-"));
  return Effect.gen(function* () {
    const failure = yield* ServerConfig.ServerConfig.pipe(
      Effect.provide(
        WorkspaceAccount.layerFromCore.pipe(
          Layer.provide(ServerConfig.layerTest(directory, directory)),
          Layer.provide(
            Layer.mock(CoreClient.CoreClient)({
              identity: () =>
                Effect.fail(
                  new AgentShareCoreError({
                    operation: "identity",
                    category: "unavailable",
                  }),
                ),
            }),
          ),
        ),
      ),
      Effect.flip,
    );
    assert.equal(failure._tag, "AgentShareCoreError");
    assert.isFalse(NodeFS.existsSync(NodePath.join(directory, "accounts")));
  }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true }))),
  );
});

// Linux names an open, already-deleted file "<path> (deleted)" in /proc/self/fd.
// SQLite names its temp files "etilqs_*" and, without TMPDIR, puts them in
// /var/tmp while os.tmpdir() is /tmp, so match the name, not the directory.
const openDeletedTempFiles = () =>
  NodeFS.readdirSync("/proc/self/fd").flatMap((fd) => {
    try {
      const target = NodeFS.readlinkSync(`/proc/self/fd/${fd}`);
      return target.includes("/etilqs_") && target.endsWith(" (deleted)") ? [target] : [];
    } catch {
      return [];
    }
  });

it.effect.skipIf(HostProcess.Platform.defaultValue() !== "linux")(
  "keeps a write transaction's statement journal off the temp directory",
  () => {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-temp-"));
    const persistence = SqlitePersistence.layerFromPath(
      NodePath.join(tempDir, "state.sqlite"),
    ).pipe(Layer.provide(NodeServices.layer));

    return Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE journal_probe(id INTEGER PRIMARY KEY, payload TEXT NOT NULL)`;
      for (let id = 0; id < 64; id++) {
        yield* sql`INSERT INTO journal_probe VALUES (${id}, ${"x".repeat(4096)})`;
      }
      const before = new Set(openDeletedTempFiles());
      const opened = yield* sql.withTransaction(
        Effect.gen(function* () {
          // A multi-row update can fail halfway, so SQLite journals every page
          // it changes, here well past the 64 KiB it holds in memory by default.
          yield* sql`UPDATE journal_probe SET payload = payload || 'y'`;
          return openDeletedTempFiles().filter((target) => !before.has(target));
        }),
      );
      assert.deepEqual(opened, []);
    }).pipe(
      Effect.provide(persistence),
      Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
    );
  },
);

it.effect("drops planner statistics a database already has", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-stats-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");
  const persistence = () =>
    SqlitePersistence.layerFromPath(dbPath).pipe(Layer.provide(NodeServices.layer));

  return Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE walk_probe(node_id TEXT PRIMARY KEY, parent_node_id TEXT)`;
      yield* sql`INSERT INTO walk_probe VALUES ('node-1', NULL), ('node-2', 'node-1')`;
      yield* sql`ANALYZE walk_probe`;
    }).pipe(Effect.provide(persistence()));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const stats = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM sqlite_stat1
      `;
      assert.equal(stats[0]?.count, 0);
      // A connection still using the old stats scans the table at each step.
      const plan = yield* sql<{ readonly detail: string }>`
        EXPLAIN QUERY PLAN
        WITH RECURSIVE retained(node_id) AS (
          SELECT 'node-2'
          UNION
          SELECT parent.parent_node_id FROM walk_probe AS parent
          INNER JOIN retained ON parent.node_id = retained.node_id
        )
        SELECT node_id FROM retained
      `;
      assert.include(
        plan.map((row) => row.detail),
        "SEARCH parent USING INDEX sqlite_autoindex_walk_probe_1 (node_id=?)",
      );
    }).pipe(Effect.provide(persistence()));
  }).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});

it.effect("creates its own database while preserving an adjacent older database", () => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "db-isolation-"));
  const userdata = NodePath.join(directory, "userdata");
  NodeFS.mkdirSync(userdata);
  const source = NodePath.join(userdata, "state.sqlite");
  const database = new NodeSqlite.DatabaseSync(source);
  database.exec(
    "CREATE TABLE generated_private_history(value TEXT); INSERT INTO generated_private_history VALUES ('generated fixture')",
  );
  database.close();
  const before = NodeFS.readFileSync(source);
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const copied =
      yield* sql`SELECT name FROM sqlite_schema WHERE name = 'generated_private_history'`;
    assert.deepEqual(copied, []);
    yield* sql`CREATE TABLE generated_new_history(value TEXT)`;
    yield* sql`INSERT INTO generated_new_history VALUES ('new work')`;
    assert.deepEqual(NodeFS.readFileSync(source), before);
  }).pipe(
    Effect.provide(
      SqlitePersistence.layerConfig.pipe(
        Layer.provide(ServerConfig.layerTest(directory, directory)),
        Layer.provide(NodeServices.layer),
      ),
    ),
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true }))),
  );
});
