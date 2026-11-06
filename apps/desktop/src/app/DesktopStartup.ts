import type { DesktopStartupState } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Electron from "electron";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import {
  renderLinuxStartupEntry,
  renderMacStartupEntry,
  startupArguments,
  startupContextFromArguments,
  startupEntryMarker,
} from "./DesktopStartupEntries.ts";

export class DesktopStartupError extends Schema.TaggedError<DesktopStartupError>()(
  "DesktopStartupError",
  {
    operation: Schema.Literals(["read", "write", "unsupported"]),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class DesktopStartup extends Context.Service<
  DesktopStartup,
  {
    readonly get: Effect.Effect<DesktopStartupState, DesktopStartupError>;
    readonly set: (enabled: boolean) => Effect.Effect<DesktopStartupState, DesktopStartupError>;
    readonly reconcile: Effect.Effect<void, DesktopStartupError>;
  }
>()("@t3tools/desktop/app/DesktopStartup") {}

const isStartupError = Schema.is(DesktopStartupError);

interface WindowsStartupAdapter {
  readonly read: (input: {
    readonly identifier: string;
    readonly executable: string;
    readonly args: string[];
  }) => {
    readonly enabled: boolean;
    readonly blocked: boolean;
  };
  readonly write: (input: {
    readonly identifier: string;
    readonly executable: string;
    readonly args: string[];
    readonly enabled: boolean;
    readonly blocked: boolean;
  }) => void;
}

export const make = Effect.fn("desktop.startup.make")(function* (windows: WindowsStartupAdapter) {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const env = yield* HostProcess.Environment;
  const executable = yield* HostProcess.ExecutablePath;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const random = yield* SecureRandom.SecureRandom;
  const lock = yield* Semaphore.make(1);
  const platform = environment.platform;
  const supported =
    environment.isPackaged &&
    !environment.isDevelopment &&
    ["darwin", "win32", "linux"].includes(platform);
  if (!supported)
    return DesktopStartup.of({
      get: Effect.succeed({ supported: false, enabled: false, blocked: false }),
      set: Effect.fn("desktop.startup.unsupported")(() =>
        Effect.fail(new DesktopStartupError({ operation: "unsupported" })),
      ),
      reconcile: Effect.void,
    });
  const identifier = `${environment.appUserModelId}.startup`;
  const marker = startupEntryMarker(identifier);
  const coreHome = path.resolve(
    environment.backendCwd,
    env.AGENTSHARE_HOME?.trim() ||
      (platform === "win32"
        ? path.join(
            env.LOCALAPPDATA || path.join(environment.homeDirectory, "AppData", "Local"),
            "AgentShare",
          )
        : path.join(environment.homeDirectory, ".config", "agentshare")),
  );
  const args = startupArguments({
    workbenchHome: environment.baseDir,
    coreHome,
    ...Option.match(environment.configuredBackendPort, {
      onNone: () => ({}),
      onSome: (port) => ({ port }),
    }),
  });
  const target =
    platform === "linux"
      ? Option.getOrElse(environment.desktopLauncherPath, () =>
          Option.getOrElse(environment.appImagePath, () => executable),
        )
      : executable;
  const windowsInput = {
    identifier,
    executable: target,
    args,
  };
  const entryPath =
    platform === "darwin"
      ? path.join(environment.homeDirectory, "Library", "LaunchAgents", `${identifier}.plist`)
      : path.join(
          env.XDG_CONFIG_HOME?.trim() || path.join(environment.homeDirectory, ".config"),
          "autostart",
          `${identifier}.desktop`,
        );
  const content =
    platform === "darwin"
      ? renderMacStartupEntry({
          identifier,
          bundleIdentifier: environment.appUserModelId,
          executable: target,
          args,
        })
      : renderLinuxStartupEntry({
          identifier,
          displayName: environment.displayName,
          executable: target,
          args,
        });

  const readEntry = Effect.fn("desktop.startup.readEntry")(function* () {
    const value = yield* fs.readFileString(entryPath).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound" ? Effect.succeed(null) : Effect.fail(error),
      }),
    );
    if (value !== null && !value.includes(marker))
      return yield* new DesktopStartupError({ operation: "read" });
    return value;
  });
  const read = Effect.fn("desktop.startup.read")(function* (): Effect.fn.Return<
    DesktopStartupState,
    DesktopStartupError
  > {
    if (!supported) return { supported: false, enabled: false, blocked: false };
    if (platform === "win32")
      return {
        supported,
        ...(yield* Effect.try({
          try: () => windows.read(windowsInput),
          catch: (cause) => new DesktopStartupError({ operation: "read", cause }),
        })),
      };
    const value = yield* readEntry().pipe(
      Effect.mapError((cause) => new DesktopStartupError({ operation: "read", cause })),
    );
    const disabled =
      value === null ||
      (platform === "linux"
        ? /^\s*(?:Hidden\s*=\s*true|X-GNOME-Autostart-enabled\s*=\s*false)\s*$/im.test(value)
        : /<key>Disabled<\/key>\s*<true\s*\/>/.test(value));
    return { supported, enabled: !disabled, blocked: false };
  });
  const write = Effect.fn("desktop.startup.write")(function* (enabled: boolean, blocked = false) {
    if (!supported) return yield* new DesktopStartupError({ operation: "unsupported" });
    if (enabled)
      yield* Effect.try({
        try: () => startupContextFromArguments(args, platform),
        catch: (cause) => new DesktopStartupError({ operation: "write", cause }),
      });
    if (platform === "win32")
      return yield* Effect.try({
        try: () => windows.write({ ...windowsInput, enabled, blocked }),
        catch: (cause) => new DesktopStartupError({ operation: "write", cause }),
      });
    yield* readEntry();
    if (!enabled) return yield* fs.remove(entryPath, { force: true });
    const temporary = `${entryPath}.${yield* random.uuidV4()}.tmp`;
    yield* fs.makeDirectory(path.dirname(entryPath), { recursive: true });
    yield* Effect.gen(function* () {
      yield* fs.writeFileString(temporary, content, { mode: 0o600, flag: "wx" });
      yield* fs.rename(temporary, entryPath);
    }).pipe(Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore)));
  });
  const set = Effect.fn("desktop.startup.set")(function* (enabled: boolean) {
    yield* write(enabled).pipe(
      Effect.mapError((cause) =>
        isStartupError(cause) ? cause : new DesktopStartupError({ operation: "write", cause }),
      ),
    );
    return yield* read();
  }, lock.withPermit);

  return DesktopStartup.of({
    get: lock.withPermit(read()),
    set,
    reconcile: lock.withPermit(
      Effect.gen(function* () {
        const state = yield* read();
        if (state.enabled)
          yield* write(true, state.blocked).pipe(
            Effect.mapError((cause) =>
              isStartupError(cause)
                ? cause
                : new DesktopStartupError({ operation: "write", cause }),
            ),
          );
      }),
    ),
  });
});

export const layer = Layer.effect(
  DesktopStartup,
  make({
    read: ({ identifier, executable, args }) => {
      const value = Electron.app.getLoginItemSettings({ path: executable, args });
      const own = value.launchItems.find(
        (item) => item.name === identifier && item.scope === "user",
      );
      return { enabled: own !== undefined, blocked: own?.enabled === false };
    },
    write: ({ identifier, executable, args, enabled, blocked }) =>
      Electron.app.setLoginItemSettings({
        name: identifier,
        path: executable,
        args,
        openAtLogin: enabled,
        enabled: enabled && !blocked,
      }),
  }),
);
