import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopStartup from "./DesktopStartup.ts";

it.effect.each(["darwin", "linux"] as const)(
  "owns and reconciles only its startup entry on %s",
  (platform) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const home = path.join(directory, "home");
        const service = yield* DesktopStartup.make({
          read: () => {
            throw new Error("Windows adapter used on POSIX");
          },
          write: () => {
            throw new Error("Windows adapter used on POSIX");
          },
        }).pipe(
          Effect.provideService(DesktopEnvironment.DesktopEnvironment, {
            platform,
            isPackaged: true,
            isDevelopment: false,
            homeDirectory: home,
            baseDir: path.join(home, "Work bench"),
            backendCwd: home,
            appUserModelId: "app.agentshare.client",
            displayName: "AgentShare Client",
            desktopLauncherPath: Option.none(),
            appImagePath: Option.none(),
            configuredBackendPort: Option.some(48710),
          } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
          Effect.provideService(HostProcess.Environment, {
            AGENTSHARE_HOME: path.join(home, "Core"),
          }),
          Effect.provideService(
            HostProcess.ExecutablePath,
            "/Applications/Client.app/Contents/MacOS/Client",
          ),
        );
        const file =
          platform === "darwin"
            ? path.join(home, "Library", "LaunchAgents", "app.agentshare.client.startup.plist")
            : path.join(home, ".config", "autostart", "app.agentshare.client.startup.desktop");
        assert.isFalse((yield* service.get).enabled);
        assert.isTrue((yield* service.set(true)).enabled);
        const original = yield* fs.readFileString(file);
        assert.include(original, "--agentshare-workbench-home=");
        assert.include(original, "--agentshare-core-home=");
        assert.include(original, "48710");
        const disabled =
          platform === "darwin"
            ? original.replace("</dict>", "<key>Disabled</key><true/></dict>")
            : original + "Hidden=true\n";
        yield* fs.writeFileString(file, disabled);
        assert.isFalse((yield* service.get).enabled);
        yield* service.reconcile;
        assert.equal(yield* fs.readFileString(file), disabled);
        yield* service.set(true);
        yield* fs.writeFileString(
          file,
          original.replaceAll("/Applications/Client.app", "/old/Client.app"),
        );
        yield* service.reconcile;
        assert.equal(yield* fs.readFileString(file), original);
        yield* service.set(false);
        assert.isFalse(yield* fs.exists(file));
        yield* fs.writeFileString(file, "Created by another application");
        assert.isTrue(Exit.isFailure(yield* Effect.exit(service.set(false))));
        assert.equal(yield* fs.readFileString(file), "Created by another application");
      }),
    ).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))),
);

it.effect(
  "preserves a Windows system-disabled item during update and enables it only on an explicit change",
  () =>
    Effect.gen(function* () {
      let enabled = false;
      let blocked = false;
      let savedArgs: readonly string[] = [];
      const service = yield* DesktopStartup.make({
        read: () => ({ enabled, blocked }),
        write: (input) => {
          enabled = input.enabled;
          blocked = input.blocked;
          savedArgs = input.args;
        },
      }).pipe(
        Effect.provideService(DesktopEnvironment.DesktopEnvironment, {
          platform: "win32",
          isPackaged: true,
          isDevelopment: false,
          homeDirectory: "C:\\Users\\reader",
          baseDir: "C:\\Users\\reader\\Work bench",
          backendCwd: "C:\\Users\\reader",
          appUserModelId: "app.agentshare.client",
          displayName: "AgentShare Client",
          desktopLauncherPath: Option.none(),
          appImagePath: Option.none(),
          configuredBackendPort: Option.none(),
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Effect.provideService(HostProcess.Environment, { AGENTSHARE_HOME: "D:\\Private Core" }),
        Effect.provideService(HostProcess.ExecutablePath, "C:\\Apps\\Client.exe"),
      );
      assert.isTrue((yield* service.set(true)).enabled);
      assert.include(savedArgs, "--agentshare-core-home=D:\\Private Core");
      blocked = true;
      yield* service.reconcile;
      assert.isTrue(blocked);
      assert.isFalse((yield* service.set(true)).blocked);
      assert.isFalse((yield* service.set(false)).enabled);
    }).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer, NodePath.layerWin32)),
    ),
);
