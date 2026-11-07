import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import * as OtelEnvironment from "@t3tools/shared/otelEnvironment";
import { parsePersistedServerObservabilitySettings } from "@t3tools/shared/serverSettings";
import * as Digest from "effect/crypto/Digest";
import * as Hex from "effect/encoding/Hex";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServerConfig from "../config.ts";
import { layerLocalCore } from "./LocalCore.ts";

export const layerFromCore = Layer.effect(
  ServerConfig.ServerConfig,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const core = yield* CoreClient.CoreClient;
    const digest = yield* Digest.Digest;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const identity = yield* core.identity();
    if (
      identity.account_generation === undefined ||
      identity.account_generation < 0 ||
      identity.stopping
    )
      return yield* new AgentShareCoreError({
        operation: "workspace",
        category: "invalid-runtime",
      });
    const key = Hex.encode(
      yield* digest.digest(Digest.sha256, new TextEncoder().encode(identity.owner)),
    );
    const paths = yield* ServerConfig.deriveServerPaths(
      path.join(config.baseDir, "accounts", key),
      config.devUrl,
      { baseDirIsExplicit: path.basename(config.stateDir) !== "dev" },
    );
    yield* ServerConfig.ensureServerDirectories(paths);
    const persisted = parsePersistedServerObservabilitySettings(
      (yield* fs.exists(paths.settingsPath)) ? yield* fs.readFileString(paths.settingsPath) : "",
    );
    const {
      otlpTracesSource,
      otlpMetricsSource,
      otlpLogsSource,
      otlpTracesVariable: _tracesVariable,
      otlpMetricsVariable: _metricsVariable,
      otlpLogsVariable: _logsVariable,
      ...base
    } = config;
    const traces = OtelEnvironment.resolveSignalEndpoint(
      config.otelEnvironment,
      "traces",
      {
        url: otlpTracesSource === "environment" ? config.otlpTracesUrl : undefined,
        export: config.otlpTracesExport,
      },
      {
        bootstrapUrl: otlpTracesSource === "bootstrap" ? config.otlpTracesUrl : undefined,
        settingsUrl: persisted.otlpTracesUrl,
      },
    );
    const metrics = OtelEnvironment.resolveSignalEndpoint(
      config.otelEnvironment,
      "metrics",
      {
        url: otlpMetricsSource === "environment" ? config.otlpMetricsUrl : undefined,
        export: config.otlpMetricsExport,
      },
      {
        bootstrapUrl: otlpMetricsSource === "bootstrap" ? config.otlpMetricsUrl : undefined,
        settingsUrl: persisted.otlpMetricsUrl,
      },
    );
    const logs = OtelEnvironment.resolveSignalEndpoint(
      config.otelEnvironment,
      "logs",
      {
        url: otlpLogsSource === "environment" ? config.otlpLogsUrl : undefined,
        export: config.otlpLogsExport,
      },
      {
        bootstrapUrl: otlpLogsSource === "bootstrap" ? config.otlpLogsUrl : undefined,
        settingsUrl: persisted.otlpLogsUrl,
      },
    );
    return ServerConfig.make({
      ...base,
      ...paths,
      otlpTracesUrl: traces?.url,
      otlpMetricsUrl: metrics?.url,
      otlpLogsUrl: logs?.url,
      ...(traces ? { otlpTracesSource: traces.source } : {}),
      ...(traces?.variable ? { otlpTracesVariable: traces.variable } : {}),
      ...(metrics ? { otlpMetricsSource: metrics.source } : {}),
      ...(metrics?.variable ? { otlpMetricsVariable: metrics.variable } : {}),
      ...(logs ? { otlpLogsSource: logs.source } : {}),
      ...(logs?.variable ? { otlpLogsVariable: logs.variable } : {}),
      // The host lock and service discovery stay at the configured host root.
      serverRuntimeStatePath: config.serverRuntimeStatePath,
      agentShareOwner: identity.owner,
      agentShareAccountGeneration: identity.account_generation,
    });
  }),
);

export const layer = layerFromCore.pipe(
  Layer.provideMerge(layerLocalCore),
  Layer.provide(NodeHttpClient.layerNodeHttp),
  Layer.provide(NodeCrypto.layer),
);

export const awaitAccountChange = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const core = yield* CoreClient.CoreClient;
  yield* Effect.sleep("1 second").pipe(
    Effect.andThen(core.identity()),
    Effect.map(
      (identity) =>
        !identity.stopping &&
        (identity.owner !== config.agentShareOwner ||
          identity.account_generation !== config.agentShareAccountGeneration),
    ),
    Effect.orElseSucceed(() => false),
    Effect.repeat({ until: (changed) => changed }),
    Effect.asVoid,
  );
});
