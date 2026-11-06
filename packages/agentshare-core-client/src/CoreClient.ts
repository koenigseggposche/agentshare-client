import {
  AgentShareCoreError,
  AgentShareHostIdentity,
  AgentShareModelCatalog,
  type AgentShareModel,
  type AgentShareReadResource,
  type AgentShareCommandOperation,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

export class CoreHome extends Context.Service<CoreHome, { readonly directory: string }>()(
  "@agentshare/core-client/CoreClient/CoreHome",
) {}

export class CoreBootstrap extends Context.Service<
  CoreBootstrap,
  {
    readonly prepare: Effect.Effect<void, AgentShareCoreError>;
    readonly invalidate: Effect.Effect<void>;
  }
>()("@agentshare/core-client/CoreClient/CoreBootstrap") {}

export const layerExternalCore = Layer.succeed(CoreBootstrap, {
  prepare: Effect.void,
  invalidate: Effect.void,
});

const Runtime = Schema.Struct({
  url: Schema.String,
  capability: Schema.String,
  pid: Schema.Number,
});
const isCoreError = Schema.is(AgentShareCoreError);
const decodeRuntime = Schema.decodeUnknownEffect(Schema.fromJsonString(Runtime));

export function isLocalRuntimeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port !== "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const READS = {
  status: "/v1/status",
  capabilities: "/v1/capabilities",
  prices: "/v1/prices",
  models: "/v1/models",
  modelStatus: "/v1/model-manager/status",
  hardware: "/v1/model-manager/hardware",
  devices: "/v1/model-manager/devices",
  tools: "/v1/tools",
  toolOperations: "/v1/tools/operations",
  profile: "/v1/billing/identity",
} as const satisfies Record<AgentShareReadResource, string>;
export type CoreRead = keyof typeof READS;

const COMMANDS = {
  signIn: ["POST", "/v1/pair"],
  cancelSignIn: ["DELETE", "/v1/pair"],
  signOut: ["POST", "/v1/disconnect"],
  consumer: ["POST", "/v1/capabilities/consumer"],
  autostart: ["POST", "/v1/autostart"],
  checkSources: ["POST", "/v1/sources/check"],
  startSharing: ["POST", "/v1/sharing/start"],
  pauseSharing: ["POST", "/v1/sharing/{id}/pause"],
  resumeSharing: ["POST", "/v1/sharing/{id}/resume"],
  stopSharing: ["POST", "/v1/sharing/{id}/stop"],
  nativeLogin: ["POST", "/v1/sources/{id}/login"],
  refreshCatalog: ["POST", "/v1/model-manager/catalog/refresh"],
  installModel: ["POST", "/v1/model-manager/install"],
  importModel: ["POST", "/v1/model-manager/operations"],
  removeModel: ["DELETE", "/v1/model-manager/installations/{id}"],
  startModel: ["POST", "/v1/model-manager/runtime/{id}/start"],
  stopModel: ["POST", "/v1/model-manager/runtime/{id}/stop"],
  pauseDownload: ["POST", "/v1/model-manager/tasks/{id}/pause"],
  resumeDownload: ["POST", "/v1/model-manager/install"],
  cancelDownload: ["POST", "/v1/model-manager/tasks/{id}/cancel"],
  modelSharing: ["POST", "/v1/model-manager/sharing"],
  modelBudget: ["POST", "/v1/model-manager/budget"],
  moveLibrary: ["POST", "/v1/model-manager/operations"],
  cancelModelOperation: ["POST", "/v1/model-manager/operations/{id}/cancel"],
  installTool: ["POST", "/v1/tools/operations"],
  cancelToolOperation: ["POST", "/v1/tools/operations/{id}/cancel"],
  selectTool: ["POST", "/v1/tools/{id}/selection"],
} as const satisfies Record<AgentShareCommandOperation, readonly ["POST" | "DELETE", string]>;
export type CoreCommand = keyof typeof COMMANDS;

const ModelLease = Schema.Struct({
  id: Schema.String,
  service: Schema.String,
  model: Schema.String,
  directory: Schema.String,
  connection: Schema.Struct({
    base_url: Schema.String,
    api_key: Schema.String,
    session_id: Schema.optionalKey(Schema.String),
  }),
  local_model: Schema.optionalKey(Schema.Boolean),
  max_output_tokens: Schema.optionalKey(Schema.Number),
  context_tokens: Schema.optionalKey(Schema.Number),
});
export type ModelLease = typeof ModelLease.Type;

const NativeLaunch = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  service: Schema.Literals(["codex", "claude"]),
  model: Schema.String,
  binary: Schema.String,
  args: Schema.Array(Schema.String),
  environment: Schema.Record(Schema.String, Schema.String),
  directory: Schema.String,
});
export type NativeLaunch = typeof NativeLaunch.Type;

export class CoreClient extends Context.Service<
  CoreClient,
  {
    readonly identity: () => Effect.Effect<AgentShareHostIdentity, AgentShareCoreError>;
    readonly models: () => Effect.Effect<typeof AgentShareModelCatalog.Type, AgentShareCoreError>;
    readonly consoleSession: (owner: string) => Effect.Effect<string, AgentShareCoreError>;
    readonly read: (resource: CoreRead) => Effect.Effect<Schema.Json, AgentShareCoreError>;
    readonly command: (
      operation: CoreCommand,
      body?: Schema.Json,
      target?: string,
    ) => Effect.Effect<Schema.Json, AgentShareCoreError>;
    readonly acquireModel: (input: {
      readonly model: AgentShareModel;
      readonly directory: string;
    }) => Effect.Effect<ModelLease, AgentShareCoreError>;
    readonly acquireNative: (input: {
      readonly owner: string;
      readonly model: AgentShareModel;
      readonly directory: string;
    }) => Effect.Effect<NativeLaunch, AgentShareCoreError>;
    readonly renewModel: (id: string) => Effect.Effect<void, AgentShareCoreError>;
    readonly releaseModel: (id: string) => Effect.Effect<void, AgentShareCoreError>;
  }
>()("@agentshare/core-client/CoreClient") {}

const make = Effect.gen(function* () {
  const home = yield* CoreHome;
  const bootstrap = yield* CoreBootstrap;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  const runtimePath = path.join(home.directory, "core", "runtime.json");

  const request = Effect.fn("AgentShareCore.request")(function* (
    operation: string,
    method: "GET" | "POST" | "DELETE",
    route: string,
    body?: Schema.Json,
  ) {
    yield* bootstrap.prepare;
    const runtime = yield* fs.readFileString(runtimePath).pipe(
      Effect.mapError(
        (cause) => new AgentShareCoreError({ operation, category: "unavailable", cause }),
      ),
      Effect.flatMap((raw) =>
        decodeRuntime(raw).pipe(
          Effect.mapError(
            (cause) => new AgentShareCoreError({ operation, category: "invalid-runtime", cause }),
          ),
        ),
      ),
    );
    if (!isLocalRuntimeUrl(runtime.url) || runtime.capability.length < 16) {
      return yield* new AgentShareCoreError({ operation, category: "invalid-runtime" });
    }
    const req = HttpClientRequest.make(method)(new URL(route, runtime.url).toString()).pipe(
      HttpClientRequest.setHeader("Authorization", `Bearer ${runtime.capability}`),
      HttpClientRequest.setHeader("Accept", "application/json"),
    );
    return yield* http
      .execute(body === undefined ? req : req.pipe(HttpClientRequest.bodyJsonUnsafe(body)))
      .pipe(
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300) {
            return Effect.fail(
              new AgentShareCoreError({
                operation,
                category:
                  response.status === 401 || response.status === 403 ? "denied" : "rejected",
                status: response.status,
              }),
            );
          }
          return response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
            Effect.mapError(
              (cause) =>
                new AgentShareCoreError({ operation, category: "invalid-response", cause }),
            ),
          );
        }),
        Effect.timeout("90 seconds"),
        Effect.mapError((cause) =>
          isCoreError(cause)
            ? cause
            : new AgentShareCoreError({
                operation,
                category: method === "GET" ? "unavailable" : "outcome-unknown",
                cause,
              }),
        ),
        Effect.tapError((error) =>
          error.category === "unavailable" || error.category === "outcome-unknown"
            ? bootstrap.invalidate
            : Effect.void,
        ),
        // Core management credentials must never follow a redirect to another endpoint.
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      );
  });

  const sessionRequest = (operation: string, method: "POST" | "DELETE", id: string) =>
    /^[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/.test(id)
      ? request(
          operation,
          method,
          `/v1/cli-sessions/${encodeURIComponent(id)}`,
          method === "POST" ? {} : undefined,
        )
      : Effect.fail(new AgentShareCoreError({ operation, category: "invalid-operation" }));
  return CoreClient.of({
    identity: Effect.fn("CoreClient.identity")(() =>
      request("identity", "GET", "/v1/workbench").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(AgentShareHostIdentity)),
        Effect.mapError((cause) =>
          isCoreError(cause)
            ? cause
            : new AgentShareCoreError({
                operation: "identity",
                category: "invalid-response",
                cause,
              }),
        ),
      ),
    ),
    models: Effect.fn("CoreClient.models")(() =>
      request("models", "GET", READS.models).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(AgentShareModelCatalog)),
        Effect.mapError((cause) =>
          isCoreError(cause)
            ? cause
            : new AgentShareCoreError({ operation: "models", category: "invalid-response", cause }),
        ),
      ),
    ),
    consoleSession: Effect.fn("CoreClient.consoleSession")((owner: string) =>
      request("consoleSession", "POST", "/v1/workbench/console-session", { owner }).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Struct({ ticket: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)) }),
          ),
        ),
        Effect.map((result) => result.ticket),
        Effect.mapError((cause) =>
          isCoreError(cause)
            ? cause
            : new AgentShareCoreError({
                operation: "consoleSession",
                category: "invalid-response",
                cause,
              }),
        ),
      ),
    ),
    read: Effect.fn("CoreClient.read")((resource: CoreRead) =>
      request(resource, "GET", READS[resource]),
    ),
    command: Effect.fn("CoreClient.command")(
      (operation: CoreCommand, body?: Schema.Json, target?: string) => {
        const [method, template] = COMMANDS[operation];
        if (
          (template.includes("{id}") || operation === "resumeDownload") &&
          (!target || !/^[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/.test(target))
        ) {
          return Effect.fail(new AgentShareCoreError({ operation, category: "invalid-operation" }));
        }
        return request(
          operation,
          method,
          template.replace("{id}", encodeURIComponent(target ?? "")),
          operation === "resumeDownload" ? { id: target ?? "" } : body,
        );
      },
    ),
    acquireModel: Effect.fn("CoreClient.acquireModel")(
      (input: { readonly model: AgentShareModel; readonly directory: string }) =>
        request("acquireModel", "POST", "/v1/model-sessions", input).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ModelLease)),
          Effect.mapError((cause) =>
            isCoreError(cause)
              ? cause
              : new AgentShareCoreError({
                  operation: "acquireModel",
                  category: "invalid-response",
                  cause,
                }),
          ),
        ),
    ),
    acquireNative: Effect.fn("CoreClient.acquireNative")(
      (input: {
        readonly owner: string;
        readonly model: AgentShareModel;
        readonly directory: string;
      }) =>
        request("acquireNative", "POST", "/v1/workbench/sessions", input).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(NativeLaunch)),
          Effect.mapError((cause) =>
            isCoreError(cause)
              ? cause
              : new AgentShareCoreError({
                  operation: "acquireNative",
                  category: "invalid-response",
                  cause,
                }),
          ),
        ),
    ),
    renewModel: Effect.fn("CoreClient.renewModel")((id: string) =>
      sessionRequest("renewModel", "POST", id).pipe(Effect.asVoid),
    ),
    releaseModel: Effect.fn("CoreClient.releaseModel")((id: string) =>
      sessionRequest("releaseModel", "DELETE", id).pipe(Effect.asVoid),
    ),
  });
});

export const layer = Layer.effect(CoreClient, make);
