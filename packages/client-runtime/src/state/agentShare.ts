import {
  WS_METHODS,
  AgentShareModelCatalog,
  AgentShareModelManager,
  AgentShareHardware,
  AgentShareTools,
  AgentShareToolOperations,
  type AgentShareWalletReadInput,
  type AgentShareFundsReadInput,
  type AgentShareReadInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { requestGuarded } from "../rpc/client.ts";
import {
  createEnvironmentQueryAtomFamily,
  createEnvironmentRpcCommand,
  withRpcPermissionGuard,
} from "./runtime.ts";

export function createAgentShareEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const state = createEnvironmentQueryAtomFamily(runtime, {
    label: "agentshare:state",
    staleTimeMs: 2_000,
    refreshIntervalMs: 3_000,
    execute: (_input: Record<string, never>) =>
      requestGuarded(WS_METHODS.agentShareGetState, {}).pipe(withRpcPermissionGuard(runtime)),
  });
  const read = createEnvironmentQueryAtomFamily(runtime, {
    label: "agentshare:read",
    staleTimeMs: 3_000,
    execute: (input: AgentShareReadInput) =>
      requestGuarded(WS_METHODS.agentShareRead, input).pipe(withRpcPermissionGuard(runtime)),
  });
  const models = createEnvironmentQueryAtomFamily(runtime, {
    label: "agentshare:models",
    staleTimeMs: 5_000,
    execute: (_input: { readonly owner: string }) =>
      requestGuarded(WS_METHODS.agentShareRead, { resource: "models" }).pipe(
        withRpcPermissionGuard(runtime),
        Effect.flatMap(Schema.decodeUnknownEffect(AgentShareModelCatalog)),
      ),
  });
  return {
    state,
    fundsRead: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:funds-read",
      tag: WS_METHODS.agentShareFundsRead,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
    }),
    fundsCommand: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:funds-command",
      tag: WS_METHODS.agentShareFundsCommand,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
    }),
    funds: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:funds",
      staleTimeMs: 5_000,
      execute: (input: AgentShareFundsReadInput) =>
        requestGuarded(WS_METHODS.agentShareFundsRead, input).pipe(withRpcPermissionGuard(runtime)),
    }),
    walletCommand: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:wallet-command",
      tag: WS_METHODS.agentShareWalletCommand,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
    }),
    wallet: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:wallet",
      staleTimeMs: 5_000,
      idleTtlMs: 0,
      execute: (input: AgentShareWalletReadInput) =>
        requestGuarded(WS_METHODS.agentShareWalletRead, input).pipe(
          withRpcPermissionGuard(runtime),
        ),
    }),
    models,
    modelManager: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:model-manager",
      staleTimeMs: 2_000,
      refreshIntervalMs: 3_000,
      execute: (_input: { readonly owner: string }) =>
        requestGuarded(WS_METHODS.agentShareRead, { resource: "modelStatus" }).pipe(
          withRpcPermissionGuard(runtime),
          Effect.flatMap(Schema.decodeUnknownEffect(AgentShareModelManager)),
        ),
    }),
    hardware: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:hardware",
      staleTimeMs: 60_000,
      execute: (_input: { readonly owner: string }) =>
        requestGuarded(WS_METHODS.agentShareRead, { resource: "hardware" }).pipe(
          withRpcPermissionGuard(runtime),
          Effect.flatMap(Schema.decodeUnknownEffect(AgentShareHardware)),
        ),
    }),
    toolOperations: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:tool-operations",
      staleTimeMs: 2_000,
      refreshIntervalMs: 3_000,
      execute: (_input: { readonly owner: string }) =>
        requestGuarded(WS_METHODS.agentShareRead, { resource: "toolOperations" }).pipe(
          withRpcPermissionGuard(runtime),
          Effect.flatMap(Schema.decodeUnknownEffect(AgentShareToolOperations)),
        ),
    }),
    tools: createEnvironmentQueryAtomFamily(runtime, {
      label: "agentshare:tools",
      staleTimeMs: 10_000,
      execute: (_input: { readonly owner: string }) =>
        requestGuarded(WS_METHODS.agentShareRead, { resource: "tools" }).pipe(
          withRpcPermissionGuard(runtime),
          Effect.flatMap(Schema.decodeUnknownEffect(AgentShareTools)),
        ),
    }),
    configureModel: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:configure-model",
      tag: WS_METHODS.agentShareConfigureModel,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
    }),
    prepareTerminal: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:prepare-terminal",
      tag: WS_METHODS.agentSharePrepareTerminal,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
    }),
    read,
    command: createEnvironmentRpcCommand(runtime, {
      label: "agentshare:command",
      tag: WS_METHODS.agentShareCommand,
      concurrency: { mode: "singleFlight", key: ({ environmentId }) => environmentId },
      onSuccess: ({ environmentId }, registry) =>
        Effect.sync(() => registry.refresh(state({ environmentId, input: {} }))),
    }),
  };
}
