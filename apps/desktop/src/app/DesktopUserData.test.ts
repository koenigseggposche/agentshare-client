import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect.each([true, false])(
  "isolates the new desktop profile from existing data (development=%s)",
  (isDevelopment) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "generated-profile-" });
      for (const name of ["T3 Code (Dev)", "T3 Code (Alpha)", "t3code", "t3code-v2"]) {
        const legacy = path.join(root, name);
        yield* fs.makeDirectory(legacy);
        yield* fs.writeFileString(path.join(legacy, "Local State"), "generated-private-profile");
      }
      const destination = yield* resolveUserDataPath({ appDataDirectory: root, isDevelopment });
      assert.equal(
        destination,
        path.join(root, isDevelopment ? "agentshare-client-dev" : "agentshare-client"),
      );
      assert.deepEqual(yield* fs.readDirectory(destination), []);
      yield* fs.writeFileString(path.join(destination, "Local State"), "generated-current-profile");
      yield* resolveUserDataPath({ appDataDirectory: root, isDevelopment });
      assert.equal(
        yield* fs.readFileString(path.join(destination, "Local State")),
        "generated-current-profile",
      );
      assert.equal(
        yield* fs.readFileString(path.join(root, "T3 Code (Dev)", "Local State")),
        "generated-private-profile",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
