import * as CoreClient from "@agentshare/core-client/CoreClient";
import {
  ProviderDriverKind,
  agentShareModelsMatch,
  TextGenerationError,
  type AgentShareModel,
  type AgentShareModelCatalog,
  type AgentShareHostIdentity,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import type {
  ProviderDriverCreateInput,
  ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import { withInstanceIdentity } from "@t3tools/provider-core/server/instanceIdentity";
import { makeManagedServerProvider } from "@t3tools/provider-core/server/managedProvider";
import { buildServerProvider } from "@t3tools/provider-core/server/snapshotProbe";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import { ProviderDriverError } from "../provider/Errors.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const decodeTools = Schema.decodeUnknownEffect(
  Schema.Struct({
    codex: Schema.Struct({ installed: Schema.Boolean, version: Schema.optionalKey(Schema.String) }),
    claude: Schema.optionalKey(
      Schema.Struct({ installed: Schema.Boolean, version: Schema.optionalKey(Schema.String) }),
    ),
  }),
);

export function nativeModelSnapshot(input: {
  readonly selected: AgentShareModel;
  readonly owner: string;
  readonly identity: AgentShareHostIdentity;
  readonly catalog: typeof AgentShareModelCatalog.Type;
  readonly tools: { readonly installed: boolean; readonly version?: string };
  readonly enabled: boolean;
  readonly checkedAt: string;
}) {
  const model = input.catalog.models.find(
    (entry) =>
      agentShareModelsMatch(input.selected, entry.model) &&
      entry.runtimes.includes(input.selected.runtime),
  );
  const sameOwner = input.identity.owner === input.owner;
  const authorized = sameOwner && (input.selected.source === "local" || input.identity.paired);
  const available = authorized && model?.available === true && input.tools.installed;
  return buildServerProvider({
    presentation: {
      displayName: input.selected.runtime === "claude" ? "AgentShare Claude" : "AgentShare Codex",
      supportsConversationRollback: true,
      reportsContextWindow: true,
      supportedRuntimeModes: ["approval-required", "full-access"],
    },
    enabled: input.enabled,
    checkedAt: input.checkedAt,
    models:
      available && model
        ? [
            {
              slug: model.model.id,
              name: model.name,
              isCustom: false,
              isDefault: true,
              capabilities: null,
            },
          ]
        : [],
    skills: [],
    probe: {
      installed: input.tools.installed,
      version: input.tools.version ?? null,
      status: available ? "ready" : "warning",
      auth: { status: authorized ? "authenticated" : "unauthenticated" },
      ...(!available
        ? {
            message: !sameOwner
              ? "Choose this model again after signing in to the current account."
              : !input.tools.installed
                ? `Install ${input.selected.runtime === "claude" ? "Claude" : "Codex"} on this host through AgentShare.`
                : "The selected model source is unavailable. Check AgentShare account and model settings.",
          }
        : {}),
    },
  });
}

const auxiliaryFailure = (operation: string) =>
  Effect.fail(
    new TextGenerationError({
      operation,
      detail: "Automatic paid text generation is disabled for this model connection.",
    }),
  );
const textGeneration: ProviderTextGeneration = {
  generateThreadTitle: () => auxiliaryFailure("thread-title"),
  generateBranchName: () => auxiliaryFailure("branch-name"),
  generateCommitMessage: () => auxiliaryFailure("commit-message"),
  generatePrContent: () => auxiliaryFailure("pr-content"),
  generateReviewGuide: () => auxiliaryFailure("review-guide"),
};

export const makeAgentShareNativeProvider = Effect.fn("AgentShare.makeNativeProvider")(function* <
  Settings extends {
    readonly agentShareOwner?: string;
    readonly agentShareModel?: AgentShareModel;
  },
  E,
  R,
>(
  input: ProviderDriverCreateInput<Settings>,
  runtime: "codex" | "claude",
  adapter: Effect.Effect<ProviderAdapter.ProviderAdapterV2["Service"], E, R>,
) {
  const selected = input.config.agentShareModel;
  const owner = input.config.agentShareOwner;
  const DRIVER = ProviderDriverKind.make(selected?.runtime === "claude" ? "claudeAgent" : "codex");
  if (selected === undefined || owner === undefined || selected.runtime !== runtime)
    return yield* new ProviderDriverError({
      driver: DRIVER,
      instanceId: input.instanceId,
      detail: "Choose a coding model in AgentShare settings.",
    });
  const label = selected.runtime === "claude" ? "AgentShare Claude" : "AgentShare Codex";
  const core = yield* CoreClient.CoreClient;
  const host = yield* ProviderHost.ProviderHost;
  const continuationIdentity = {
    driverKind: DRIVER,
    continuationKey: `agentshare:${[owner, selected.source, selected.service, selected.id, selected.device ?? "", selected.policy ?? ""].map(encodeURIComponent).join(":")}`,
  };
  const stamp = withInstanceIdentity({
    instanceId: input.instanceId,
    driverKind: DRIVER,
    displayName: input.displayName,
    accentColor: input.accentColor,
    continuationGroupKey: continuationIdentity.continuationKey,
  });
  const pending = Effect.map(DateTime.now, (now) =>
    stamp(
      buildServerProvider({
        presentation: { displayName: label },
        enabled: input.enabled,
        checkedAt: DateTime.formatIso(now),
        models: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Checking the selected AgentShare model source.",
        },
      }),
    ),
  );
  const check = Effect.gen(function* () {
    const identity = yield* core.identity();
    const catalog = yield* core.models();
    const tools = yield* core.read("tools").pipe(Effect.flatMap(decodeTools));
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    return stamp(
      nativeModelSnapshot({
        selected,
        owner,
        identity,
        catalog,
        tools: (selected.runtime === "claude" ? tools.claude : tools.codex) ?? { installed: false },
        enabled: input.enabled,
        checkedAt,
      }),
    );
  }).pipe(
    Effect.catch(() =>
      pending.pipe(
        Effect.map((base) => ({
          ...base,
          message: "The AgentShare model host is unavailable. Reconnect it and refresh.",
        })),
      ),
    ),
  );
  const snapshot = yield* makeManagedServerProvider({
    resolveMaintenance: () => Effect.succeed({ provider: DRIVER, packageName: null, update: null }),
    getSettings: host.settings.get,
    streamSettings: host.settings.changes,
    haveSettingsChanged: () => false,
    initialSnapshot: () => pending,
    checkProvider: check,
  }).pipe(
    Effect.mapError(
      () =>
        new ProviderDriverError({
          driver: DRIVER,
          instanceId: input.instanceId,
          detail: "Could not prepare the selected AgentShare model.",
        }),
    ),
  );
  const orchestrationAdapter = yield* adapter.pipe(
    Effect.mapError(
      () =>
        new ProviderDriverError({
          driver: DRIVER,
          instanceId: input.instanceId,
          detail: "Could not prepare the coding runtime.",
        }),
    ),
  );
  return {
    instanceId: input.instanceId,
    driverKind: DRIVER,
    continuationIdentity,
    displayName: input.displayName,
    accentColor: input.accentColor,
    enabled: input.enabled,
    snapshot,
    orchestrationAdapter,
    textGeneration,
  } satisfies ProviderInstance;
});
