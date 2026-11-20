import { readUiTranslator, subscribeUiLanguage } from "../settings/uiLanguage.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import * as Electron from "electron";

export interface TrayOptions {
  readonly iconPath: string;
  readonly title: string;
  readonly onOpen: () => void;
  readonly onQuit: () => void;
}

export class ElectronTrayError extends Schema.TaggedError<ElectronTrayError>()(
  "ElectronTrayError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to create the workbench tray icon.";
  }
}

export class ElectronTray extends Context.Service<
  ElectronTray,
  {
    readonly create: (options: TrayOptions) => Effect.Effect<void, ElectronTrayError, Scope.Scope>;
  }
>()("@t3tools/desktop/electron/ElectronTray") {}

/** @public */
export const make = ElectronTray.of({
  create: Effect.fn("ElectronTray.create")((options) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => {
          const icon = Electron.nativeImage.createFromPath(options.iconPath);
          if (icon.isEmpty()) throw new Error("The tray icon is empty.");
          const tray = new Electron.Tray(icon);
          try {
            tray.setToolTip(options.title);
            const updateMenu = () => {
              if (tray.isDestroyed()) return;
              const uiText = readUiTranslator();
              tray.setContextMenu(
                Electron.Menu.buildFromTemplate([
                  { label: uiText("Open AgentShare"), click: options.onOpen },
                  { label: uiText("Tasks continue after closing"), enabled: false },
                  { type: "separator" },
                  { label: uiText("Quit workbench"), click: options.onQuit },
                ]),
              );
            };
            updateMenu();
            const unsubscribe = subscribeUiLanguage(updateMenu);
            tray.on("click", options.onOpen);
            tray.on("double-click", options.onOpen);
            return { tray, unsubscribe };
          } catch (error) {
            tray.destroy();
            throw error;
          }
        },
        catch: (cause) => new ElectronTrayError({ cause }),
      }),
      ({ tray, unsubscribe }) =>
        Effect.sync(() => {
          unsubscribe();
          tray.destroy();
        }),
    ).pipe(Effect.asVoid),
  ),
});

export const layer = Layer.succeed(ElectronTray, make);
