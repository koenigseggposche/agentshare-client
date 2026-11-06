import * as NodeServices from "@effect/platform-node/NodeServices";
import { FundsJournalStorage } from "@agentshare/account-client/FundsJournal";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as Storage from "./FundsJournalStorage.ts";

it.layer(NodeServices.layer)("private funds journal storage", (it) => {
  it.effect("commits a snapshot and restores it through a fresh SQLite connection", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "generated-funds-" });
      const directory = path.join(root, "journal");
      const first = yield* FundsJournalStorage.pipe(
        Effect.provide(Storage.layerForDirectory(directory)),
      );
      assert.isNull(yield* first.load());
      assert.isFalse(yield* fs.exists(directory));
      yield* first.save("generated-first-snapshot", null);
      const restarted = yield* FundsJournalStorage.pipe(
        Effect.provide(Storage.layerForDirectory(directory)),
      );
      assert.equal(yield* restarted.load(), "generated-first-snapshot");
      yield* restarted.save("generated-second-snapshot", "generated-first-snapshot");
      assert.equal(yield* first.load(), "generated-second-snapshot");
      assert.equal(
        (yield* first.save("stale write", "generated-first-snapshot").pipe(Effect.flip)).category,
        "unavailable",
      );
      assert.equal(yield* restarted.load(), "generated-second-snapshot");
      if ((yield* HostProcess.Platform) !== "win32") {
        assert.equal((yield* fs.stat(directory)).mode & 0o777, 0o700);
        assert.equal((yield* fs.stat(path.join(directory, "funds.sqlite"))).mode & 0o777, 0o600);
      }
    }).pipe(Effect.scoped),
  );
  it.effect("preserves an unrecognized database instead of replacing it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "generated-funds-" });
      const filename = path.join(root, "funds.sqlite");
      yield* fs.writeFileString(filename, "generated corrupt database");
      const storage = yield* FundsJournalStorage.pipe(
        Effect.provide(Storage.layerForDirectory(root)),
      );
      assert.equal(
        (yield* storage.save("replacement", null).pipe(Effect.flip)).category,
        "unavailable",
      );
      assert.equal(yield* fs.readFileString(filename), "generated corrupt database");
    }).pipe(Effect.scoped),
  );
  it.effect("refuses a symlink without touching the referenced file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "generated-funds-" });
      const outside = path.join(root, "other");
      const directory = path.join(root, "journal");
      yield* fs.makeDirectory(directory);
      yield* fs.writeFileString(outside, "generated external contents");
      yield* fs.symlink(outside, path.join(directory, "funds.sqlite"));
      const storage = yield* FundsJournalStorage.pipe(
        Effect.provide(Storage.layerForDirectory(directory)),
      );
      assert.equal(
        (yield* storage.save("replacement", null).pipe(Effect.flip)).category,
        "unavailable",
      );
      assert.equal(yield* fs.readFileString(outside), "generated external contents");
    }).pipe(Effect.scoped),
  );
});
