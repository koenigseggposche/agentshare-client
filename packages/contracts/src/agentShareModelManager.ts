import * as Schema from "effect/Schema";

const bytes = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }));
const localModel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  license: Schema.String,
  share_allowed: Schema.Boolean,
  minimum_ram_bytes: bytes,
  artifact: Schema.Struct({ bytes }),
  shards: Schema.optionalKey(Schema.Array(Schema.Struct({ artifact: Schema.Struct({ bytes }) }))),
});
const task = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  bytes,
  total: bytes,
  error: Schema.optionalKey(Schema.String),
});
const runtime = Schema.Struct({
  state: Schema.String,
  error: Schema.optionalKey(Schema.String),
  reserved_ram_bytes: bytes,
  reserved_vram_bytes: Schema.optionalKey(bytes),
  active_requests: bytes,
  queued: bytes,
});
export const AgentShareResourceBudget = Schema.Struct({
  ram_bytes: bytes,
  vram_bytes: Schema.optionalKey(bytes),
  max_concurrent: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })),
});
export type AgentShareResourceBudget = typeof AgentShareResourceBudget.Type;
export const AgentShareModelOperationRequest = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  kind: Schema.Literals(["import", "move"]),
  path: Schema.String,
  model_id: Schema.optionalKey(Schema.String),
});
export const AgentShareModelOperation = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["import", "move"]),
  path: Schema.String,
  model_id: Schema.optionalKey(Schema.String),
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
  bytes,
  total: bytes,
  error: Schema.optionalKey(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type AgentShareModelOperation = typeof AgentShareModelOperation.Type;
export const AgentShareModelManager = Schema.Struct({
  operations: Schema.optionalKey(Schema.Array(AgentShareModelOperation)),
  library_path: Schema.String,
  catalog_fresh: Schema.Boolean,
  catalog: Schema.Struct({ models: Schema.NullOr(Schema.Array(localModel)) }),
  state: Schema.Struct({
    budget: AgentShareResourceBudget,
    runtime_error: Schema.optionalKey(Schema.String),
    installations: Schema.NullOr(
      Schema.Record(Schema.String, Schema.Struct({ model: localModel })),
    ),
    tasks: Schema.NullOr(Schema.Record(Schema.String, task)),
    runtimes: Schema.NullOr(Schema.Record(Schema.String, runtime)),
  }),
  remote_access: Schema.NullOr(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        visibility: Schema.String,
        connected: Schema.optionalKey(Schema.Boolean),
        accepting: Schema.optionalKey(Schema.Boolean),
        draining: Schema.optionalKey(Schema.Boolean),
        paused: Schema.optionalKey(Schema.Boolean),
        error: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
});
export type AgentShareModelManager = typeof AgentShareModelManager.Type;
export const AgentShareHardware = Schema.Struct({
  os: Schema.String,
  arch: Schema.String,
  version: Schema.String,
  ram_bytes: bytes,
  gpu: Schema.optionalKey(Schema.String),
  vram_bytes: Schema.optionalKey(bytes),
});
