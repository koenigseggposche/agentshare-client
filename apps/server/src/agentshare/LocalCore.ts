import * as CoreClient from "@agentshare/core-client/CoreClient";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServerConfig from "../config.ts";
import * as CoreInstallation from "./CoreInstallation.ts";
const layerCoreHome = Layer.effect(
  CoreClient.CoreHome,
  Effect.gen(function* () {
    const env = yield* HostProcess.Environment;
    const home = yield* HostProcess.HomeDirectory;
    const platform = yield* HostProcess.Platform;
    const path = yield* Path.Path;
    const config = yield* ServerConfig.ServerConfig;
    const directory =
      env.AGENTSHARE_HOME?.trim() ||
      (config.devUrl !== undefined
        ? path.join(config.baseDir, "agentshare")
        : platform === "win32"
          ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "AgentShare")
          : path.join(home, ".config", "agentshare"));
    return { directory };
  }),
);

export const layerLocalCore = CoreClient.layer.pipe(
  Layer.provide(CoreInstallation.layer),
  Layer.provide(layerCoreHome),
);
