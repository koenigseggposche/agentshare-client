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
            tray.setContextMenu(
              Electron.Menu.buildFromTemplate([
                { label: "打开 AgentShare / Open AgentShare", click: options.onOpen },
                { label: "关闭窗口后任务继续运行 / Tasks continue after closing", enabled: false },
                { type: "separator" },
                { label: "退出工作台 / Quit workbench", click: options.onQuit },
              ]),
            );
            tray.on("click", options.onOpen);
            tray.on("double-click", options.onOpen);
            return tray;
          } catch (error) {
            tray.destroy();
            throw error;
          }
        },
        catch: (cause) => new ElectronTrayError({ cause }),
      }),
      (tray) => Effect.sync(() => tray.destroy()),
    ).pipe(Effect.asVoid),
  ),
});

export const layer = Layer.succeed(ElectronTray, make);
