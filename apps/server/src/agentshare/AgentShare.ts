import * as LocalTextDriver from "./LocalTextDriver.ts";
import { layerLocalCore } from "./LocalCore.ts";
import * as Digest from "effect/crypto/Digest";
import * as Hex from "effect/encoding/Hex";
import * as ServerSettings from "../serverSettings.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import {
  AgentShareCoreError,
  agentShareModelsMatch,
  ProviderInstanceId,
  ProviderDriverKind,
  CodexSettings,
  ClaudeSettings,
  type AgentShareConfigureModelInput,
  type AgentShareConfigureModelResult,
  AgentShareDeviceStatus,
  type AgentShareCommandInput,
  type AgentShareReadResource,
  type AgentShareWorkbenchState,
  type AgentSharePrepareTerminalInput,
  type AgentSharePrepareTerminalResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";

export class AgentShare extends Context.Service<
  AgentShare,
  {
    readonly configureModel: (
      input: AgentShareConfigureModelInput,
    ) => Effect.Effect<AgentShareConfigureModelResult, AgentShareCoreError>;
    readonly getState: () => Effect.Effect<AgentShareWorkbenchState, AgentShareCoreError>;
    readonly read: (
      resource: AgentShareReadResource,
    ) => Effect.Effect<Schema.Json, AgentShareCoreError>;
    readonly command: (
      input: AgentShareCommandInput,
    ) => Effect.Effect<Schema.Json, AgentShareCoreError>;
    readonly prepareTerminal: (
      input: AgentSharePrepareTerminalInput,
    ) => Effect.Effect<AgentSharePrepareTerminalResult, AgentShareCoreError>;
  }
>()("t3/agentshare/AgentShare") {}

// HTTP failures may hold the Core capability in their request; only bounded attributes cross RPC.
const isCoreError = Schema.is(AgentShareCoreError);
const publicCoreError = (error: AgentShareCoreError) =>
  new AgentShareCoreError({
    operation: error.operation,
    category: error.category,
    ...(error.status === undefined ? {} : { status: error.status }),
  });

const decodeStatus = Schema.decodeUnknownEffect(AgentShareDeviceStatus);
const decodeLauncher = Schema.decodeUnknownEffect(
  Schema.Struct({
    launcher: Schema.Struct({ binary: Schema.NonEmptyString, home: Schema.NonEmptyString }),
  }),
);

function terminalCommand(shell: string, args: readonly string[]): string | undefined {
  if (args.some((arg) => /[\0\r\n]/.test(arg))) return;
  const name = shell
    .split(/[\\/]/)
    .at(-1)
    ?.toLowerCase()
    .replace(/\.exe$/, "");
  if (name === "pwsh" || name === "powershell")
    return `& ${args.map((arg) => `'${arg.replace(/['\u2018\u2019]/g, "$&$&")}'`).join(" ")}`;
  if (name && ["sh", "bash", "zsh", "dash", "ash", "ksh", "fish"].includes(name))
    return args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
}

const make = Effect.gen(function* () {
  const core = yield* CoreClient.CoreClient;
  const settings = yield* ServerSettings.ServerSettingsService;
  const digest = yield* Digest.Digest;
  const terminals = yield* TerminalManager.TerminalManager;
  const path = yield* Path.Path;
  const decodeCodexSettings = Schema.decodeUnknownEffect(CodexSettings);
  const decodeClaudeSettings = Schema.decodeUnknownEffect(ClaudeSettings);
  const decodeTextSettings = Schema.decodeUnknownEffect(LocalTextDriver.Settings);
  return AgentShare.of({
    prepareTerminal: Effect.fn("AgentShare.prepareTerminal")(
      function* (input) {
        const identity = yield* core.identity();
        if (identity.owner !== input.owner)
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "denied",
          });
        if (!identity.features.includes("interactive-cli"))
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "invalid-runtime",
          });
        if (input.model.runtime === "text" || !path.isAbsolute(input.directory))
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "invalid-operation",
          });
        const { launcher } = yield* core.read("tools").pipe(Effect.flatMap(decodeLauncher));
        if (!path.isAbsolute(launcher.binary) || !path.isAbsolute(launcher.home))
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "invalid-runtime",
          });
        const shell = yield* terminals.getShell({
          threadId: input.threadId,
          terminalId: input.terminalId,
        });
        const args = [
          launcher.binary,
          "workbench-cli",
          "--home",
          launcher.home,
          "--owner",
          input.owner,
          "--model",
          input.model.id,
          "--source",
          input.model.source,
          "--service",
          input.model.service,
          "--runtime",
          input.model.runtime,
          "--directory",
          input.directory,
          ...(input.model.device ? ["--device", input.model.device] : []),
          ...(input.model.policy ? ["--policy", input.model.policy] : []),
          "--",
        ];
        const command = terminalCommand(shell, args);
        if (!command || command.length > 32768)
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "invalid-operation",
          });
        if ((yield* core.identity()).owner !== input.owner)
          return yield* new AgentShareCoreError({
            operation: "prepareTerminal",
            category: "denied",
          });
        return { command };
      },
      Effect.mapError((cause) =>
        isCoreError(cause)
          ? publicCoreError(cause)
          : new AgentShareCoreError({ operation: "prepareTerminal", category: "unavailable" }),
      ),
    ),
    configureModel: Effect.fn("AgentShare.configureModel")(
      function* (input) {
        if (
          input.model.runtime === "text" &&
          (input.model.source !== "local" || input.model.service !== "local")
        )
          return yield* new AgentShareCoreError({
            operation: "configureModel",
            category: "invalid-operation",
          });
        const identity = yield* core.identity();
        if (identity.owner !== input.owner)
          return yield* new AgentShareCoreError({
            operation: "configureModel",
            category: "denied",
          });
        const catalog = yield* core.models();
        const entry = catalog.models.find(
          (item) =>
            agentShareModelsMatch(input.model, item.model) &&
            item.runtimes.includes(input.model.runtime),
        );
        if (!entry?.available || (input.model.source !== "local" && !identity.paired))
          return yield* new AgentShareCoreError({
            operation: "configureModel",
            category: "denied",
          });
        const key = [
          identity.owner,
          input.model.source,
          input.model.service,
          input.model.id,
          input.model.device ?? "",
          input.model.runtime,
          input.model.policy ?? "",
        ].join("\0");
        const hash = yield* digest.digest(Digest.sha256, new TextEncoder().encode(key));
        const instanceId = ProviderInstanceId.make(`as_${Hex.encode(hash).slice(0, 48)}`);
        const decodeSettings =
          input.model.runtime === "text"
            ? decodeTextSettings
            : input.model.runtime === "claude"
              ? decodeClaudeSettings
              : decodeCodexSettings;
        const config = yield* decodeSettings({
          agentShareOwner: identity.owner,
          agentShareModel: input.model,
        });
        if ((yield* core.identity()).owner !== identity.owner)
          return yield* new AgentShareCoreError({
            operation: "configureModel",
            category: "denied",
          });
        yield* settings.updateProviderInstance(
          {
            operation: "upsert",
            instanceId,
            instance: {
              driver: ProviderDriverKind.make(
                input.model.runtime === "text"
                  ? "agentshareText"
                  : input.model.runtime === "claude"
                    ? "claudeAgent"
                    : "codex",
              ),
              displayName: `${entry.name} · ${input.model.source}${entry.device_name ? ` · ${entry.device_name}` : ""}`,
              enabled: true,
              config,
            },
          },
          { idleCompaction: "off", compactIdleThreads: false, branchNamingMode: "static" },
        );
        return { instanceId };
      },
      Effect.mapError((cause) =>
        isCoreError(cause)
          ? publicCoreError(cause)
          : new AgentShareCoreError({ operation: "configureModel", category: "rejected" }),
      ),
    ),
    getState: Effect.fn("AgentShare.getState")(function* () {
      const host = yield* core.identity();
      const status = yield* core.read("status").pipe(
        Effect.flatMap((value) =>
          decodeStatus(value).pipe(
            Effect.mapError(
              (cause) =>
                new AgentShareCoreError({
                  operation: "state",
                  category: "invalid-response",
                  cause,
                }),
            ),
          ),
        ),
      );
      return { host, status };
    }, Effect.mapError(publicCoreError)),
    read: Effect.fn("AgentShare.read")(
      (resource) => core.read(resource),
      Effect.mapError(publicCoreError),
    ),
    command: Effect.fn("AgentShare.command")(
      (input) =>
        core.command(input.operation, input.body, "target" in input ? input.target : undefined),
      Effect.mapError(publicCoreError),
    ),
  });
});

export const layer = Layer.effect(AgentShare, make);

export const layerLocal = layer.pipe(Layer.provide(layerLocalCore));
