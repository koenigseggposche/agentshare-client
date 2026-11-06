import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTray from "../electron/ElectronTray.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopState from "./DesktopState.ts";
import * as DesktopTray from "./DesktopTray.ts";

it.effect.each([
  { platform: "win32", fail: false },
  { platform: "linux", fail: false },
  { platform: "linux", fail: true },
] as const)(
  "owns the tray lifetime and falls back on creation failure: $platform / $fail",
  ({ platform, fail }) =>
    Effect.gen(function* () {
      const opened = yield* Deferred.make<void>();
      const quit = yield* Deferred.make<void>();
      let activateCalls = 0;
      let released = false;
      let callbacks: ElectronTray.TrayOptions | undefined;
      const layer = Layer.mergeAll(
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
          platform,
          displayName: "AgentShare",
        } as DesktopEnvironment.DesktopEnvironment["Service"]),
        Layer.mock(DesktopAssets.DesktopAssets, {
          iconPaths: Effect.succeed({
            ico: Option.some("/icon.ico"),
            png: Option.some("/icon.png"),
            icns: Option.none(),
          }),
        }),
        Layer.mock(ElectronApp.ElectronApp, {
          quit: Deferred.succeed(quit, undefined).pipe(Effect.asVoid),
        }),
        Layer.mock(DesktopWindow.DesktopWindow, {
          activate: Effect.sync(() => {
            activateCalls++;
          }).pipe(Effect.andThen(Deferred.succeed(opened, undefined)), Effect.asVoid),
        }),
        Layer.succeed(ElectronTray.ElectronTray, {
          create: (options) =>
            fail
              ? Effect.fail(
                  new ElectronTray.ElectronTrayError({ cause: new Error("No tray host") }),
                )
              : Effect.acquireRelease(
                  Effect.sync(() => {
                    callbacks = options;
                  }),
                  () =>
                    Effect.sync(() => {
                      released = true;
                    }),
                ),
        }),
        DesktopState.layer,
      );
      yield* Effect.gen(function* () {
        const tray = yield* DesktopTray.make;
        const state = yield* DesktopState.DesktopState;
        assert.isFalse(yield* tray.keepRunning);
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* tray.configure;
            assert.equal(yield* tray.keepRunning, !fail);
            if (!callbacks) return;
            assert.equal(callbacks.iconPath, platform === "win32" ? "/icon.ico" : "/icon.png");
            callbacks.onOpen();
            yield* Deferred.await(opened);
            yield* Ref.set(state.quitting, true);
            callbacks.onOpen();
            callbacks.onQuit();
            yield* Deferred.await(quit);
            assert.equal(activateCalls, 1);
            assert.isFalse(released);
          }),
        );
        assert.isFalse(yield* tray.keepRunning);
        assert.equal(released, !fail);
      }).pipe(Effect.provide(layer));
    }),
);
