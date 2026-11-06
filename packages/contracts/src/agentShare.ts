import { AgentShareModelOperationRequest } from "./agentShareModelManager.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import * as Schema from "effect/Schema";

export const AgentShareModel = Schema.Struct({
  id: Schema.String,
  service: Schema.Literals(["codex", "claude", "local"]),
  source: Schema.Literals(["local", "owned", "community"]),
  device: Schema.optionalKey(Schema.String),
  runtime: Schema.Literals(["codex", "claude", "text"]),
  policy: Schema.optionalKey(Schema.String),
});
export type AgentShareModel = typeof AgentShareModel.Type;

export const AgentShareModelInfo = Schema.Struct({
  model: AgentShareModel,
  name: Schema.String,
  device_name: Schema.optionalKey(Schema.String),
  runtimes: Schema.Array(Schema.String),
  available: Schema.Boolean,
  context_tokens: Schema.optionalKey(Schema.Number),
  max_output_tokens: Schema.optionalKey(Schema.Number),
  max_input_bytes: Schema.optionalKey(Schema.Number),
  price: Schema.optionalKey(Schema.Json),
  subagents: Schema.Boolean,
  search: Schema.Boolean,
});
export type AgentShareModelInfo = typeof AgentShareModelInfo.Type;

export function agentShareWorkbenchModels(models: ReadonlyArray<AgentShareModelInfo>) {
  return models.flatMap((entry) =>
    (["codex", "claude", "text"] as const)
      .filter(
        (runtime) =>
          entry.runtimes.includes(runtime) &&
          (runtime !== "text" ||
            (entry.model.source === "local" && entry.model.service === "local")),
      )
      .map((runtime) => ({ ...entry, model: { ...entry.model, runtime } })),
  );
}

export const AgentShareModelCatalog = Schema.Struct({
  models: Schema.Array(AgentShareModelInfo),
  diagnostics: Schema.Array(Schema.String),
});

export const AgentShareHostIdentity = Schema.Struct({
  api_version: Schema.Literal(1),
  version: Schema.String,
  revision: Schema.String,
  owner: Schema.String,
  device_id: Schema.String,
  paired: Schema.Boolean,
  stopping: Schema.Boolean,
  features: Schema.Array(Schema.String),
});
export type AgentShareHostIdentity = typeof AgentShareHostIdentity.Type;

export const AgentShareDeviceStatus = Schema.Struct({
  paired: Schema.Boolean,
  name: Schema.String,
  device_id: Schema.String,
  console_url: Schema.String,
  gateway_url: Schema.String,
  autostart: Schema.Boolean,
  stopping: Schema.Boolean,
  consumer: Schema.Struct({ status: Schema.String, generation: Schema.Number }),
  sources: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      service: Schema.String,
      installed: Schema.Boolean,
      ready: Schema.Boolean,
      connected: Schema.Boolean,
      accepting: Schema.Boolean,
      draining: Schema.optionalKey(Schema.Boolean),
      concurrency: Schema.optionalKey(Schema.Number),
      visibility: Schema.optionalKey(Schema.String),
      provider_id: Schema.optionalKey(Schema.String),
      error: Schema.optionalKey(Schema.String),
      plan: Schema.optionalKey(Schema.String),
    }),
  ),
  pair: Schema.NullOr(Schema.Struct({ user_code: Schema.String, expires_at: Schema.String })),
  pair_error: Schema.String,
});

export type AgentShareDeviceStatus = typeof AgentShareDeviceStatus.Type;

export const AgentShareReadResource = Schema.Literals([
  "status",
  "capabilities",
  "prices",
  "models",
  "modelStatus",
  "hardware",
  "devices",
  "tools",
  "toolOperations",
  "profile",
]);
export type AgentShareReadResource = typeof AgentShareReadResource.Type;

export const AgentShareCommandOperation = Schema.Literals([
  "signIn",
  "signOut",
  "cancelSignIn",
  "consumer",
  "autostart",
  "checkSources",
  "startSharing",
  "pauseSharing",
  "resumeSharing",
  "stopSharing",
  "nativeLogin",
  "refreshCatalog",
  "installModel",
  "importModel",
  "removeModel",
  "startModel",
  "stopModel",
  "pauseDownload",
  "resumeDownload",
  "cancelDownload",
  "modelSharing",
  "modelBudget",
  "moveLibrary",
  "cancelModelOperation",
  "selectTool",
  "installTool",
  "cancelToolOperation",
]);
export type AgentShareCommandOperation = typeof AgentShareCommandOperation.Type;

export const AgentShareReadInput = Schema.Struct({ resource: AgentShareReadResource });
export type AgentShareReadInput = typeof AgentShareReadInput.Type;
export const AgentShareSharingSettings = Schema.Struct({
  service: Schema.Literals(["codex", "claude"]),
  concurrency: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })),
  visibility: Schema.Literals(["owner_only", "community"]),
});
export type AgentShareSharingSettings = typeof AgentShareSharingSettings.Type;

export const AgentShareToolSelection = Schema.Union([
  Schema.Struct({
    owner: Schema.NonEmptyString,
    source: Schema.Literal("managed"),
    version: Schema.NonEmptyString,
  }),
  Schema.Struct({
    owner: Schema.NonEmptyString,
    source: Schema.Literal("system"),
    path: Schema.optionalKey(Schema.NonEmptyString),
  }),
]);
export type AgentShareToolSelection = typeof AgentShareToolSelection.Type;

export const AgentShareToolStatus = Schema.Struct({
  installed: Schema.Boolean,
  qualified: Schema.String,
  versions: Schema.Array(Schema.String),
  selection: Schema.Struct({
    source: Schema.String,
    version: Schema.optionalKey(Schema.String),
    path: Schema.optionalKey(Schema.String),
  }),
  path: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  version_error: Schema.optionalKey(Schema.Boolean),
  version_error_detail: Schema.optionalKey(Schema.String),
});
export type AgentShareToolStatus = typeof AgentShareToolStatus.Type;

export const AgentShareTools = Schema.Struct({
  codex: AgentShareToolStatus,
  claude: AgentShareToolStatus,
});

export const AgentShareToolOperationRequest = Schema.Union([
  Schema.Struct({
    id: Schema.NonEmptyString,
    owner: Schema.NonEmptyString,
    service: Schema.Literals(["codex", "claude"]),
    kind: Schema.Literal("install"),
    version: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    owner: Schema.NonEmptyString,
    service: Schema.Literals(["codex", "claude"]),
    kind: Schema.Literal("offline"),
    path: Schema.NonEmptyString,
  }),
]);
export type AgentShareToolOperationRequest = typeof AgentShareToolOperationRequest.Type;
export const AgentShareToolOperation = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  service: Schema.Literals(["codex", "claude"]),
  kind: Schema.Literals(["install", "offline"]),
  requested_version: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  state: Schema.Literals([
    "queued",
    "running",
    "cancelling",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  stage: Schema.String,
  bytes: Schema.Number,
  total: Schema.Number,
  error: Schema.optionalKey(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type AgentShareToolOperation = typeof AgentShareToolOperation.Type;
export const AgentShareToolOperations = Schema.Struct({
  operations: Schema.Array(AgentShareToolOperation),
});

export const AgentShareCommandInput = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("installTool"), body: AgentShareToolOperationRequest }),
  Schema.Struct({
    operation: Schema.Literal("cancelToolOperation"),
    target: Schema.NonEmptyString,
    body: Schema.Struct({ owner: Schema.NonEmptyString }),
  }),
  Schema.Struct({ operation: Schema.Literal("startSharing"), body: AgentShareSharingSettings }),
  Schema.Struct({
    operation: Schema.Literal("selectTool"),
    target: Schema.Literals(["codex", "claude"]),
    body: AgentShareToolSelection,
  }),
  Schema.Struct({
    operation: Schema.Literals(["importModel", "moveLibrary"]),
    body: AgentShareModelOperationRequest,
  }),
  Schema.Struct({
    operation: Schema.Literals(
      AgentShareCommandOperation.literals.filter(
        (operation) =>
          operation !== "startSharing" &&
          operation !== "selectTool" &&
          operation !== "installTool" &&
          operation !== "cancelToolOperation" &&
          operation !== "importModel" &&
          operation !== "moveLibrary",
      ),
    ),
    body: Schema.optionalKey(Schema.Json),
    target: Schema.optionalKey(Schema.String),
  }),
]);
export type AgentShareCommandInput = typeof AgentShareCommandInput.Type;

export const AgentShareWorkbenchState = Schema.Struct({
  host: AgentShareHostIdentity,
  status: AgentShareDeviceStatus,
});
export type AgentShareWorkbenchState = typeof AgentShareWorkbenchState.Type;

export class AgentShareCoreError extends Schema.TaggedError<AgentShareCoreError>()(
  "AgentShareCoreError",
  {
    operation: Schema.String,
    category: Schema.Literals([
      "unavailable",
      "invalid-runtime",
      "invalid-response",
      "invalid-operation",
      "denied",
      "rejected",
      "outcome-unknown",
    ]),
    status: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    return `AgentShare Core: ${this.category} (${this.operation}).`;
  }
}

export const AgentShareConfigureModelInput = Schema.Struct({
  owner: Schema.String,
  model: AgentShareModel,
});
export type AgentShareConfigureModelInput = typeof AgentShareConfigureModelInput.Type;
export const AgentShareConfigureModelResult = Schema.Struct({ instanceId: ProviderInstanceId });
export type AgentShareConfigureModelResult = typeof AgentShareConfigureModelResult.Type;

export const AgentSharePrepareTerminalInput = Schema.Struct({
  owner: Schema.NonEmptyString,
  model: AgentShareModel,
  directory: Schema.NonEmptyString,
  threadId: Schema.NonEmptyString,
  terminalId: Schema.NonEmptyString,
});
export type AgentSharePrepareTerminalInput = typeof AgentSharePrepareTerminalInput.Type;
export const AgentSharePrepareTerminalResult = Schema.Struct({ command: Schema.NonEmptyString });
export type AgentSharePrepareTerminalResult = typeof AgentSharePrepareTerminalResult.Type;

export function agentShareModelsMatch(
  selected: AgentShareModel,
  candidate: AgentShareModel,
): boolean {
  return (
    selected.id === candidate.id &&
    selected.service === candidate.service &&
    selected.source === candidate.source &&
    (selected.device ?? "") === (candidate.device ?? "") &&
    (selected.policy ?? "") === (candidate.policy ?? "")
  );
}
