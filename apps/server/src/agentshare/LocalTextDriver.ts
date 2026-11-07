import * as CoreClient from "@agentshare/core-client/CoreClient";
import {
  AgentShareTextSettings,
  TextGenerationError,
  agentShareModelsMatch,
} from "@t3tools/contracts";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import type { ProviderDriver } from "@t3tools/provider-core/server/driver";
import { ProviderDriverError } from "@t3tools/provider-core/server/errors";
import { withInstanceIdentity } from "@t3tools/provider-core/server/instanceIdentity";
import { makeManagedServerProvider } from "@t3tools/provider-core/server/managedProvider";
import { buildServerProvider } from "@t3tools/provider-core/server/snapshotProbe";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import * as LocalTextAdapter from "./LocalTextAdapter.ts";

export const Settings = AgentShareTextSettings;

const unavailable = (operation: string) =>
  Effect.fail(
    new TextGenerationError({
      operation,
      detail: "Use this local text model in its conversation.",
    }),
  );
const textGeneration: ProviderTextGeneration = {
  generateThreadTitle: () => unavailable("thread-title"),
  generateBranchName: () => unavailable("branch-name"),
  generateCommitMessage: () => unavailable("commit-message"),
  generatePrContent: () => unavailable("pr-content"),
  generateReviewGuide: () => unavailable("review-guide"),
};

export const Driver: ProviderDriver<
  typeof Settings.Type,
  CoreClient.CoreClient | ProviderHost.ProviderHost | FileSystem.FileSystem | Path.Path
> = {
  driverKind: LocalTextAdapter.DRIVER,
  metadata: { displayName: "AgentShare Text", hasDefaultInstance: false },
  configSchema: Settings,
  defaultConfig: () => ({}),
  create: Effect.fn("AgentShare.LocalTextDriver.create")(function* (input) {
    const selected = input.config.agentShareModel;
    const owner = input.config.agentShareOwner;
    const failure = () =>
      new ProviderDriverError({
        driver: LocalTextAdapter.DRIVER,
        instanceId: input.instanceId,
        detail: "Choose a ready local text model in AgentShare settings.",
      });
    if (
      !selected ||
      owner === undefined ||
      selected.runtime !== "text" ||
      selected.source !== "local" ||
      selected.service !== "local"
    )
      return yield* failure();
    const core = yield* CoreClient.CoreClient;
    const host = yield* ProviderHost.ProviderHost;
    const continuationIdentity = {
      driverKind: LocalTextAdapter.DRIVER,
      continuationKey: `local-text:${input.instanceId}`,
    };
    const stamp = withInstanceIdentity({
      ...input,
      driverKind: LocalTextAdapter.DRIVER,
      accentColor: input.accentColor,
      continuationGroupKey: continuationIdentity.continuationKey,
    });
    const check = Effect.fn("LocalTextDriver.check")(function* () {
      const identity = yield* core.identity();
      const catalog = yield* core.models();
      const entry = catalog.models.find(
        (entry) => agentShareModelsMatch(selected, entry.model) && entry.runtimes.includes("text"),
      );
      const ready = identity.owner === owner && entry?.available === true;
      return stamp(
        buildServerProvider({
          presentation: {
            displayName: "AgentShare Text",
            supportsConversationRollback: false,
            supportsTextGeneration: false,
            supportedRuntimeModes: ["approval-required"],
          },
          enabled: input.enabled,
          checkedAt: DateTime.formatIso(yield* DateTime.now),
          models: ready
            ? [
                {
                  slug: selected.id,
                  name: entry.name,
                  isCustom: false,
                  isDefault: true,
                  capabilities: null,
                },
              ]
            : [],
          skills: [],
          probe: {
            installed: true,
            version: null,
            status: ready ? "ready" : "warning",
            auth: { status: identity.owner === owner ? "authenticated" : "unauthenticated" },
            ...(!ready
              ? {
                  message:
                    "Start this text model on the execution host and choose it for the current account.",
                }
              : {}),
          },
        }),
      );
    });
    const initial = yield* check().pipe(Effect.mapError(failure));
    const snapshot = yield* makeManagedServerProvider({
      resolveMaintenance: () =>
        Effect.succeed({ provider: LocalTextAdapter.DRIVER, packageName: null, update: null }),
      getSettings: host.settings.get,
      streamSettings: host.settings.changes,
      haveSettingsChanged: () => false,
      initialSnapshot: () => Effect.succeed(initial),
      checkProvider: check().pipe(
        Effect.orElseSucceed(() => ({
          ...initial,
          state: "warning" as const,
          models: [],
          message: "Reconnect the local model host.",
        })),
      ),
    }).pipe(Effect.mapError(failure));
    return {
      instanceId: input.instanceId,
      driverKind: LocalTextAdapter.DRIVER,
      continuationIdentity,
      displayName: input.displayName,
      ...(input.accentColor === undefined ? {} : { accentColor: input.accentColor }),
      enabled: input.enabled,
      snapshot,
      textGeneration,
      orchestrationAdapter: yield* LocalTextAdapter.make({
        instanceId: input.instanceId,
        owner,
        model: selected,
      }),
    };
  }),
};
