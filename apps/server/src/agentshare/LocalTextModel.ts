import * as CoreClient from "@agentshare/core-client/CoreClient";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { AgentShareCoreError, type AgentShareModel } from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";

export interface LocalTextMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

const encodeRequest = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      model: Schema.String,
      messages: Schema.Array(
        Schema.Struct({ role: Schema.Literals(["user", "assistant"]), content: Schema.String }),
      ),
      max_tokens: Schema.Number,
      stream: Schema.Literal(false),
    }),
  ),
);

const decodeReply = Schema.decodeUnknownEffect(
  Schema.Struct({
    choices: Schema.Array(
      Schema.Struct({
        message: Schema.Struct({
          content: Schema.String,
          tool_calls: Schema.optionalKey(Schema.Array(Schema.Unknown)),
          function_call: Schema.optionalKey(Schema.Unknown),
        }),
      }),
    ),
  }),
);

const rejected = () =>
  new AgentShareCoreError({ operation: "localText", category: "invalid-response" });

function localCompletionUrl(base: string): string | null {
  try {
    const url = new URL(base);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.port === "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/v1" ||
      url.search !== "" ||
      url.hash !== ""
    )
      return null;
    return `${url.origin}/v1/chat/completions`;
  } catch {
    return null;
  }
}

export const complete = Effect.fn("AgentShare.LocalTextModel.complete")(function* (input: {
  readonly owner: string;
  readonly model: AgentShareModel;
  readonly directory: string;
  readonly messages: ReadonlyArray<LocalTextMessage>;
}) {
  if (
    input.model.source !== "local" ||
    input.model.service !== "local" ||
    input.model.runtime !== "text" ||
    input.messages.length === 0 ||
    input.messages.some((message) => message.role !== "user" && message.role !== "assistant")
  )
    return yield* new AgentShareCoreError({
      operation: "localText",
      category: "invalid-operation",
    });
  const core = yield* CoreClient.CoreClient;
  if ((yield* core.identity()).owner !== input.owner)
    return yield* new AgentShareCoreError({ operation: "localText", category: "denied" });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const lease = yield* Effect.acquireRelease(
        core.acquireModel({ model: input.model, directory: input.directory }),
        (lease) => core.releaseModel(lease.id).pipe(Effect.ignore),
      );
      const url = localCompletionUrl(lease.connection.base_url);
      const maxOutput = lease.max_output_tokens ?? 0;
      if (
        url === null ||
        !lease.local_model ||
        lease.service !== "text" ||
        lease.model !== input.model.id ||
        lease.connection.api_key.length < 16 ||
        !Number.isSafeInteger(maxOutput) ||
        maxOutput < 1
      )
        return yield* rejected();
      if ((yield* core.identity()).owner !== input.owner)
        return yield* new AgentShareCoreError({ operation: "localText", category: "denied" });
      const body = yield* encodeRequest({
        model: input.model.id,
        messages: input.messages.map(({ role, content }) => ({ role, content })),
        max_tokens: Math.min(1024, maxOutput),
        stream: false,
      }).pipe(Effect.mapError(() => rejected()));
      if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024)
        return yield* new AgentShareCoreError({
          operation: "localText",
          category: "invalid-operation",
        });
      const request = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.execute(
          HttpClientRequest.post(url).pipe(
            HttpClientRequest.bearerToken(lease.connection.api_key),
            HttpClientRequest.bodyText(body, "application/json"),
          ),
        );
        if (response.status !== 200) return yield* rejected();
        const reply = yield* response.json.pipe(Effect.flatMap(decodeReply));
        const message = reply.choices.length === 1 ? reply.choices[0]?.message : undefined;
        if (
          message === undefined ||
          (message.tool_calls?.length ?? 0) !== 0 ||
          (message.function_call !== undefined && message.function_call !== null)
        )
          return yield* rejected();
        if ((yield* core.identity()).owner !== input.owner)
          return yield* new AgentShareCoreError({ operation: "localText", category: "denied" });
        return message.content;
      }).pipe(
        Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.mebibytes(2)),
        Effect.provide(NodeHttpClient.layerNodeHttp),
      );
      const keepAlive = Effect.forever(
        Effect.sleep("15 seconds").pipe(Effect.andThen(core.renewModel(lease.id))),
      );
      return yield* Effect.raceFirst(request, keepAlive).pipe(
        Effect.timeout("20 minutes"),
        Effect.mapError(() => rejected()),
      );
    }),
  );
});
