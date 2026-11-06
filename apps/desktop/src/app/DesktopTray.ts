import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTray from "../electron/ElectronTray.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopState from "./DesktopState.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

export class DesktopTray extends Context.Service<
  DesktopTray,
  {
    readonly keepRunning: Effect.Effect<boolean>;
    readonly configure: Effect.Effect<void, never, Scope.Scope>;
  }
>()("@t3tools/desktop/app/DesktopTray") {}

const { logError, logInfo } = makeComponentLogger("desktop-tray");

/** @public */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const assets = yield* DesktopAssets.DesktopAssets;
  const tray = yield* ElectronTray.ElectronTray;
  const app = yield* ElectronApp.ElectronApp;
  const window = yield* DesktopWindow.DesktopWindow;
  const state = yield* DesktopState.DesktopState;
  const running = yield* Ref.make(false);
  const context = yield* Effect.context<never>();
  const run = Effect.runPromiseWith(context);
  const onOpen = () => {
    void run(
      Effect.gen(function* () {
        if (yield* Ref.get(state.quitting)) return;
        yield* window.activate;
      }).pipe(Effect.catchCause((cause) => logError("failed to open workbench", { cause }))),
    );
  };

  return DesktopTray.of({
    keepRunning: Ref.get(running),
    configure: Effect.gen(function* () {
      // macOS retains the host after closing windows and provides its Dock entry.
      if (environment.platform === "darwin" || (yield* Ref.get(running))) return;
      const icons = yield* assets.iconPaths;
      const icon = environment.platform === "win32" ? icons.ico : icons.png;
      if (Option.isNone(icon)) {
        yield* logError("no tray icon; closing the last window will quit the workbench");
        return;
      }
      yield* tray.create({
        iconPath: icon.value,
        title: environment.displayName,
        onOpen,
        onQuit: () => {
          void run(app.quit);
        },
      });
      yield* Ref.set(running, true);
      yield* Effect.addFinalizer(() => Ref.set(running, false));
      yield* logInfo("closing windows will retain the workbench; use tray Quit to stop it");
    }).pipe(Effect.catchCause((cause) => logError("background workbench unavailable", { cause }))),
  });
});

export const layer = Layer.effect(DesktopTray, make);
