// @effect-diagnostics nodeBuiltinImport:off - A loopback inference fixture exercises cancellation and persisted conversation recovery.
import * as NodeHttp from "node:http";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { assert, describe, it } from "@effect/vitest";
import {
  MessageId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as LocalTextAdapter from "./LocalTextAdapter.ts";

const instanceId = ProviderInstanceId.make("as_generated");
const threadId = ThreadId.make("generated-thread");
const model = { id: "generated", source: "local", service: "local", runtime: "text" } as const;
const modelSelection = { instanceId, model: model.id };
const runtimePolicy = {
  runtimeMode: "approval-required",
  interactionMode: "default",
  cwd: "/generated/work",
} as const;
const decodeEvent = Schema.decodeUnknownEffect(ProviderAdapter.ProviderAdapterV2Event);

function turnInput(
  providerThread: Parameters<
    ProviderAdapter.ProviderAdapterV2SessionRuntime["startTurn"]
  >[0]["providerThread"],
  ordinal: number,
  prompt: string,
): ProviderAdapter.ProviderAdapterV2TurnInput {
  const now = DateTime.makeUnsafe("2026-01-01T00:00:00Z");
  return {
    appThread: {
      createdBy: "user",
      creationSource: "web",
      id: threadId,
      projectId: ProjectId.make("generated-project"),
      title: "Generated conversation",
      providerInstanceId: instanceId,
      modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: providerThread.id,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    threadId,
    runId: RunId.make(`generated-run-${ordinal}`),
    runOrdinal: ordinal,
    attemptId: RunAttemptId.make(`generated-attempt-${ordinal}`),
    rootNodeId: NodeId.make(`generated-node-${ordinal}`),
    providerTurnOrdinal: ordinal,
    providerThread,
    modelSelection,
    runtimePolicy,
    nativeThreadHasTurns: ordinal > 1,
    message: {
      messageId: MessageId.make(`generated-message-${ordinal}`),
      text: prompt,
      attachments: [],
      createdBy: "user",
      creationSource: "web",
    },
  };
}

const drain = (session: ProviderAdapter.ProviderAdapterV2SessionRuntime) =>
  session.events.pipe(
    Stream.takeUntil((event) => event.type === "turn.terminal"),
    Stream.mapEffect((event) => decodeEvent(event)),
    Stream.runCollect,
  );

describe("local text conversation adapter", () => {
  it.live("restores completed context, refuses old attempts, and cancels a pending request", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "tmp" });
        const requests: unknown[] = [];
        const started = Promise.withResolvers<void>();
        const disconnected = Promise.withResolvers<void>();
        const server = yield* Effect.acquireRelease(
          Effect.tryPromise(
            () =>
              new Promise<NodeHttp.Server>((resolve, reject) => {
                const server = NodeHttp.createServer((request, response) => {
                  let body = "";
                  request.setEncoding("utf8");
                  request.on("data", (chunk) => {
                    body += chunk;
                  });
                  request.on("end", () => {
                    requests.push(JSON.parse(body));
                    if (requests.length === 3) {
                      response.on("close", () => disconnected.resolve());
                      started.resolve();
                    } else {
                      response.setHeader("Content-Type", "application/json");
                      response.end(
                        JSON.stringify({
                          choices: [
                            { message: { content: requests.length === 1 ? "Four." : "Eight." } },
                          ],
                        }),
                      );
                    }
                  });
                });
                server.once("error", reject);
                server.listen(0, "127.0.0.1", () => resolve(server));
              }),
          ),
          (server) =>
            Effect.promise(
              () =>
                new Promise<void>((resolve) => {
                  server.closeAllConnections();
                  server.close(() => resolve());
                }),
            ),
        );
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const releases: string[] = [];
        const environment = Layer.mergeAll(
          Layer.mock(CoreClient.CoreClient)({
            identity: () =>
              Effect.succeed({
                api_version: 1,
                version: "generated",
                revision: "generated",
                owner: "generated-owner",
                device_id: "generated",
                paired: false,
                stopping: false,
                features: [],
              }),
            acquireModel: () =>
              Effect.succeed({
                id: "generated-lease",
                service: "text",
                model: model.id,
                directory,
                local_model: true,
                max_output_tokens: 128,
                connection: {
                  base_url: `http://127.0.0.1:${address.port}/v1`,
                  api_key: "generated-model-key",
                },
              }),
            releaseModel: (id) =>
              Effect.sync(() => {
                releases.push(id);
              }),
          }),
          TestProviderHost.layer({ cwd: directory }),
        );
        yield* acceptance(requests, releases, started.promise, disconnected.promise).pipe(
          Effect.provide(environment),
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});

const acceptance = Effect.fn("LocalTextAdapterTest.acceptance")(function* (
  requests: unknown[],
  releases: string[],
  started: Promise<void>,
  disconnected: Promise<void>,
) {
  const create = LocalTextAdapter.make({ instanceId, owner: "generated-owner", model });
  yield* Effect.scoped(
    Effect.gen(function* () {
      const adapter = yield* create;
      const capabilities = yield* adapter.getCapabilities();
      assert.equal(capabilities.tools.supportsMcpTools, false);
      assert.equal(capabilities.checkpointing.appCanCheckpointFilesystem, false);
      const session = yield* adapter.openSession({
        threadId,
        providerSessionId: ProviderSessionId.make("generated-session-1"),
        modelSelection,
        runtimePolicy,
      });
      const providerThread = yield* session.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      yield* session.startTurn(turnInput(providerThread, 1, "What is two plus two?"));
      const events = yield* drain(session);
      assert.equal(events.at(-1)?.type, "turn.terminal");
      assert.ok(
        events.some(
          (event) =>
            event.type === "turn_item.updated" &&
            event.turnItem.type === "assistant_message" &&
            event.turnItem.text === "Four.",
        ),
      );
    }),
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const adapter = yield* create;
      const session = yield* adapter.openSession({
        threadId,
        providerSessionId: ProviderSessionId.make("generated-session-2"),
        modelSelection,
        runtimePolicy,
      });
      const providerThread = yield* session.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      yield* session.startTurn(turnInput(providerThread, 2, "Double that result."));
      const events = yield* drain(session);
      assert.ok(
        events.some((event) => event.type === "message.updated" && event.message.text === "Eight."),
      );
      assert.deepEqual(requests[1], {
        model: "generated",
        messages: [
          { role: "user", content: "What is two plus two?" },
          { role: "assistant", content: "Four." },
          { role: "user", content: "Double that result." },
        ],
        max_tokens: 128,
        stream: false,
      });
      yield* session
        .startTurn(turnInput(providerThread, 1, "What is two plus two?"))
        .pipe(Effect.flip);
      assert.equal(requests.length, 2);
      const pending = turnInput(providerThread, 3, "Continue.");
      yield* session.startTurn(pending);
      yield* Effect.promise(() => started);
      const running = session.events.pipe(
        Stream.filter(
          (event) =>
            event.type === "provider_turn.updated" && event.providerTurn.status === "running",
        ),
        Stream.runHead,
      );
      const event = yield* running;
      assert.equal(event._tag, "Some");
      if (event._tag === "Some" && event.value.type === "provider_turn.updated")
        yield* session.interruptTurn({
          providerThread,
          providerTurnId: event.value.providerTurn.id,
        });
      yield* Effect.promise(() => disconnected);
      const interrupted = yield* drain(session);
      assert.ok(
        interrupted.some(
          (event) => event.type === "turn.terminal" && event.status === "interrupted",
        ),
      );
      yield* session.startTurn(pending).pipe(Effect.flip);
      assert.equal(requests.length, 3);
    }),
  );
  assert.deepEqual(releases, ["generated-lease", "generated-lease", "generated-lease"]);
});
