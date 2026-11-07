import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError, ClaudeSettings, ProviderDriverKind } from "@t3tools/contracts";
import { parseCliArgs } from "@t3tools/shared/cliArgs";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import type { ProviderDriverCreateInput } from "@t3tools/provider-core/server/driver";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import { ChildProcessSpawner } from "effect/process";
import {
  ClaudeAgentSdkQueryRunner,
  ClaudeAgentSdkQueryRunnerError,
  ClaudeProviderCapabilitiesV2,
  makeClaudeAdapterV2,
  type ClaudeAgentSdkQuerySession,
} from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as ProviderContinuationRequests from "@t3tools/provider-core/server/ProviderContinuationRequests";
import * as ServerConfig from "../config.ts";
import * as NativeSessions from "./NativeSessions.ts";

const DRIVER = ProviderDriverKind.make("claudeAgent");
const CoreSettings = Schema.Struct({
  env: Schema.Record(Schema.String, Schema.String),
  alwaysThinkingEnabled: Schema.optionalKey(Schema.Boolean),
});
type CoreSettings = typeof CoreSettings.Type;
const decodeCoreSettings = Schema.decodeUnknownEffect(Schema.fromJsonString(CoreSettings));
const quoteArgument = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const encodePrivateSettings = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

export const managedClaudeQueries = Effect.fn("AgentShare.managedClaudeQueries")(function* (
  lease: {
    readonly launch: CoreClient.NativeLaunch;
    readonly keepAlive: Effect.Effect<never, AgentShareCoreError>;
  },
  settings: CoreSettings,
) {
  const runner = yield* ClaudeAgentSdkQueryRunner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const settingsDirectory = yield* fs.makeTempDirectoryScoped();
  yield* fs.chmod(settingsDirectory, 0o700);
  let settingsSequence = 0;
  const pinnedEnvironment = {
    ...settings.env,
    ...(lease.launch.environment.CLAUDE_CONFIG_DIR
      ? { CLAUDE_CONFIG_DIR: lease.launch.environment.CLAUDE_CONFIG_DIR }
      : {}),
  };
  const sessions = new Set<ClaudeAgentSdkQuerySession>();
  let closed = false;
  const unavailable = () =>
    new ClaudeAgentSdkQueryRunnerError({
      method: "query",
      cause: new Error("The selected model connection is no longer available."),
    });
  const closeAll = Effect.gen(function* () {
    closed = true;
    yield* Effect.forEach([...sessions], (session) => session.close.pipe(Effect.ignore), {
      concurrency: "unbounded",
      discard: true,
    });
  });
  yield* Effect.addFinalizer(() => closeAll);
  yield* lease.keepAlive.pipe(
    Effect.catch(() => closeAll),
    Effect.forkScoped,
  );
  return ClaudeAgentSdkQueryRunner.of({
    ...runner,
    open: Effect.fn("AgentShare.openClaudeQuery")(function* (input) {
      if (closed) return yield* unavailable();
      if (typeof input.options.settings === "string") return yield* unavailable();
      const { fallbackModel: _fallbackModel, ...queryOptions } = input.options;
      const settingsPath = path.join(settingsDirectory, `${settingsSequence++}.json`);
      const privateSettings = {
        ...input.options.settings,
        ...settings,
        env: { ...input.options.settings?.env, ...pinnedEnvironment },
      };
      yield* encodePrivateSettings(privateSettings).pipe(
        Effect.flatMap((content) => fs.writeFileString(settingsPath, content, { mode: 0o600 })),
        Effect.mapError(() => unavailable()),
      );
      const removeSettings = fs.remove(settingsPath, { force: true }).pipe(Effect.ignore);
      const session = yield* runner
        .open({
          ...input,
          options: {
            ...queryOptions,
            model: lease.launch.model,
            extraArgs: { ...input.options.extraArgs, model: lease.launch.model },
            cwd: lease.launch.directory,
            pathToClaudeCodeExecutable: lease.launch.binary,
            env: { ...input.options.env, ...lease.launch.environment },
            settings: settingsPath,
          },
        })
        .pipe(Effect.onError(() => removeSettings));
      if (closed) {
        yield* session.close.pipe(Effect.ensuring(removeSettings), Effect.ignore);
        return yield* unavailable();
      }
      const tracked: ClaudeAgentSdkQuerySession = {
        ...session,
        setModel: Effect.fn("AgentShare.setClaudeModel")((model: string) =>
          closed || model !== lease.launch.model
            ? Effect.fail(unavailable())
            : session.setModel(model),
        ),
        applyFlagSettings: Effect.fn("AgentShare.applyClaudeSettings")(
          (next: Parameters<ClaudeAgentSdkQuerySession["applyFlagSettings"]>[0]) =>
            closed
              ? Effect.fail(unavailable())
              : session.applyFlagSettings({
                  ...next,
                  ...settings,
                  env: { ...next.env, ...pinnedEnvironment },
                }),
        ),
        close: session.close.pipe(
          Effect.ensuring(removeSettings),
          Effect.ensuring(
            Effect.sync(() => {
              sessions.delete(tracked);
            }),
          ),
        ),
      };
      sessions.add(tracked);
      return tracked;
    }),
    forkSession: Effect.fn("AgentShare.forkClaudeSession")(function* (input) {
      if (closed) return yield* unavailable();
      return yield* runner.forkSession({ ...input, environment: lease.launch.environment });
    }),
  });
});

export const makeAgentShareClaudeAdapter = Effect.fn("AgentShare.makeClaudeAdapter")(function* (
  input: ProviderDriverCreateInput<ClaudeSettings>,
) {
  const context = yield* Effect.context<
    | ClaudeAgentSdkQueryRunner
    | McpProviderSessions.McpProviderSessions
    | ChildProcessSpawner.ChildProcessSpawner
    | FileSystem.FileSystem
    | Path.Path
  >();
  const native = yield* NativeSessions.NativeSessions;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const random = yield* SecureRandom.SecureRandom;
  const idAllocator = yield* IdAllocator.IdAllocatorV2;
  const continuationRequests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
  const server = yield* ServerConfig.ServerConfig;
  return ProviderAdapter.ProviderAdapterV2.of({
    instanceId: input.instanceId,
    driver: DRIVER,
    getCapabilities: Effect.fn("AgentShare.Claude.getCapabilities")(() =>
      Effect.succeed(ClaudeProviderCapabilitiesV2),
    ),
    planSelectionTransition: Effect.fn("AgentShare.Claude.planSelectionTransition")(() =>
      Effect.succeed(turnScopedSelectionTransition()),
    ),
    openSession: Effect.fn("AgentShare.openClaudeSession")(
      function* (session) {
        const selected = input.config.agentShareModel;
        const owner = input.config.agentShareOwner;
        if (
          selected?.runtime !== "claude" ||
          owner === undefined ||
          (session.workbenchTaskId !== undefined &&
            selected.source !== "community" &&
            selected.source !== "owned")
        )
          return yield* new AgentShareCoreError({ operation: "acquireNative", category: "denied" });
        const lease = yield* native.acquire({
          owner,
          model: selected,
          directory: session.runtimePolicy.cwd ?? "",
          ...(session.workbenchTaskId === undefined
            ? {}
            : { workbench_task_id: session.workbenchTaskId }),
        });
        const args = parseCliArgs(lease.launch.args);
        const settingsPath = args.flags.settings;
        const homePath = lease.launch.environment.CLAUDE_CONFIG_DIR;
        if (
          args.positionals.length > 0 ||
          args.flags.model !== lease.launch.model ||
          !settingsPath ||
          !homePath ||
          Object.keys(args.flags).some((key) => !["settings", "model", "tools"].includes(key))
        )
          return yield* new AgentShareCoreError({
            operation: "acquireNative",
            category: "invalid-response",
          });
        const coreSettings = yield* fileSystem
          .readFileString(settingsPath)
          .pipe(Effect.flatMap(decodeCoreSettings));
        const queryRunner = yield* managedClaudeQueries(lease, coreSettings).pipe(
          Effect.provide(context),
        );
        const adapter = yield* makeClaudeAdapterV2({
          instanceId: input.instanceId,
          settings: {
            ...input.config,
            enabled: input.enabled,
            binaryPath: lease.launch.binary,
            homePath,
            launchArgs: lease.launch.args.map((arg) => quoteArgument(arg)).join(" "),
          },
          environment: lease.launch.environment,
          attachmentsDir: server.attachmentsDir,
          fileSystem,
          path,
          random,
          idAllocator,
          queryRunner,
          continuationRequests,
        }).pipe(Effect.provide(context));
        return yield* adapter.openSession(session);
      },
      (effect, session) =>
        effect.pipe(
          Effect.mapError(
            () =>
              new ProviderAdapter.ProviderAdapterOpenSessionError({
                driver: DRIVER,
                providerSessionId: session.providerSessionId,
                cause: new Error("The selected model connection could not be opened."),
              }),
          ),
        ),
    ),
  });
});
