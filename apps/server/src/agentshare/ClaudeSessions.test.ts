import { assert, describe, it } from "@effect/vitest";
import { AgentShareCoreError, ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as PortScanner from "../preview/PortScanner.ts";
import { ProviderEventLoggers } from "@t3tools/provider-core/server/ProviderEventLoggers";
import {
  ClaudeAgentSdkQueryRunner,
  layerQueryRunner,
  type ClaudeAgentSdkQueryOpenInput,
  type ClaudeAgentSdkQuerySession,
} from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { managedClaudeQueries } from "./ClaudeSessions.ts";

const mockRunner = (overrides: Partial<ClaudeAgentSdkQueryRunner["Service"]>) =>
  Layer.mergeAll(Layer.mock(ClaudeAgentSdkQueryRunner)(overrides), NodeServices.layer);

const launch = {
  id: "generated-lease",
  owner: "generated-owner",
  service: "claude" as const,
  model: "generated-model",
  binary: "/generated/claude",
  args: [],
  directory: "/generated/work",
  environment: {
    ANTHROPIC_AUTH_TOKEN: "generated-capability",
    CLAUDE_CONFIG_DIR: "/generated/private",
  },
};
const input: ClaudeAgentSdkQueryOpenInput = {
  threadId: ThreadId.make("generated-thread"),
  providerSessionId: ProviderSessionId.make("generated-session"),
  options: {
    model: "unrelated-model",
    sessionId: "generated-native",
    permissionMode: "default",
    tools: { type: "preset", preset: "claude_code" },
    fallbackModel: "unrelated-fallback",
    env: { ANTHROPIC_AUTH_TOKEN: "unrelated-token" },
    settings: {
      env: { ANTHROPIC_AUTH_TOKEN: "unrelated-settings-token", CLAUDE_CONFIG_DIR: "/unrelated" },
      alwaysThinkingEnabled: true,
    },
  },
};
const sessionWith = (
  close: Effect.Effect<void>,
  overrides: Partial<ClaudeAgentSdkQuerySession> = {},
): ClaudeAgentSdkQuerySession => ({
  messages: Stream.empty,
  offer: () => Effect.void,
  setModel: () => Effect.void,
  applyFlagSettings: () => Effect.void,
  setPermissionMode: () => Effect.void,
  stopTask: () => Effect.void,
  backgroundTasks: () => Effect.succeed(false),
  interrupt: Effect.void,
  close,
  ...overrides,
});

it.live("delivers the pinned route and workspace to a real generated CLI process", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs
        .makeTempDirectoryScoped()
        .pipe(Effect.flatMap((value) => fs.realPath(value)));
      const binary = path.join(directory, "generated-cli.mjs");
      yield* fs.writeFileString(
        binary,
        `
import { createInterface } from 'node:readline';
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const value = JSON.parse(line);
  if (value.type === 'control_request') {
    send({ type: 'control_response', response: { subtype: 'success', request_id: value.request_id, response: { commands: [], agents: [], models: [] } } });
  } else if (value.type === 'user') {
    send({ type: 'assistant', session_id: 'generated-native', parent_tool_use_id: null,
      message: { id: 'generated-message', type: 'message', role: 'assistant', model: 'generated-model',
        content: [{ type: 'text', text: JSON.stringify({ directory: process.cwd(), token: process.env.ANTHROPIC_AUTH_TOKEN, home: process.env.CLAUDE_CONFIG_DIR, args: process.argv.slice(2) }) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  }
});
`,
      );
      const runner = yield* managedClaudeQueries(
        {
          launch: {
            ...launch,
            binary,
            directory,
            environment: { ...launch.environment, PATH: process.env.PATH ?? "" },
          },
          keepAlive: Effect.never,
        },
        { env: { ANTHROPIC_AUTH_TOKEN: "generated-capability" } },
      );
      const session = yield* runner.open(input);
      yield* session.offer({
        type: "user",
        session_id: "generated-native",
        parent_tool_use_id: null,
        message: { role: "user", content: "Reply with a short greeting." },
      });
      const message = yield* session.messages.pipe(
        Stream.filter((entry) => entry.type === "assistant"),
        Stream.runHead,
      );
      assert.isTrue(Option.isSome(message));
      if (Option.isNone(message) || message.value.type !== "assistant") return;
      const content = message.value.message.content[0];
      assert.equal(content?.type, "text");
      if (content?.type !== "text") return;
      const reported = JSON.parse(content.text) as {
        directory: string;
        token: string;
        home: string;
        args: string[];
      };
      assert.equal(reported.directory, directory);
      assert.equal(reported.token, "generated-capability");
      assert.equal(reported.home, "/generated/private");
      assert.equal(reported.args[reported.args.lastIndexOf("--model") + 1], launch.model);
      const settings = reported.args[reported.args.lastIndexOf("--settings") + 1];
      assert.isDefined(settings);
      assert.notInclude(reported.args.join(" "), "generated-capability");
      assert.equal(
        JSON.parse(yield* fs.readFileString(settings!)).env.ANTHROPIC_AUTH_TOKEN,
        "generated-capability",
      );
    }).pipe(
      Effect.provide(
        layerQueryRunner.pipe(
          Layer.provide(PortScanner.layerTest),
          Layer.provide(
            Layer.succeed(ProviderEventLoggers, { native: undefined, canonical: undefined }),
          ),
          Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
        ),
      ),
    ),
  ),
);

describe("AgentShare Claude process ownership", () => {
  it.effect(
    "pins the Core route, closes queries after lease loss and refuses further queries",
    () =>
      Effect.gen(function* () {
        const loss = yield* Deferred.make<never, AgentShareCoreError>();
        const stopped = yield* Deferred.make<void>();
        const requests: ClaudeAgentSdkQueryOpenInput[] = [];
        const changes: Parameters<ClaudeAgentSdkQuerySession["applyFlagSettings"]>[0][] = [];
        let modelChanges = 0;
        let closes = 0;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const runner = yield* managedClaudeQueries(
              { launch, keepAlive: Deferred.await(loss) },
              {
                env: { ANTHROPIC_AUTH_TOKEN: "generated-capability" },
                alwaysThinkingEnabled: false,
              },
            );
            const opened = yield* runner.open(input);
            yield* opened.applyFlagSettings({
              env: {
                ANTHROPIC_AUTH_TOKEN: "unrelated-update",
                CLAUDE_CONFIG_DIR: "/unrelated-update",
              },
              alwaysThinkingEnabled: true,
            });
            assert.deepEqual(changes, [
              {
                env: {
                  ANTHROPIC_AUTH_TOKEN: "generated-capability",
                  CLAUDE_CONFIG_DIR: "/generated/private",
                },
                alwaysThinkingEnabled: false,
              },
            ]);
            yield* opened.setModel("unrelated-model").pipe(Effect.flip);
            assert.equal(modelChanges, 0);
            yield* opened.setModel(launch.model);
            assert.equal(modelChanges, 1);
            assert.equal(requests[0]?.options.model, launch.model);
            assert.equal(requests[0]?.options.cwd, launch.directory);
            assert.equal(requests[0]?.options.pathToClaudeCodeExecutable, launch.binary);
            assert.equal(requests[0]?.options.env?.ANTHROPIC_AUTH_TOKEN, "generated-capability");
            assert.isUndefined(requests[0]?.options.fallbackModel);
            assert.deepEqual(
              JSON.parse(yield* fs.readFileString(String(requests[0]?.options.settings))),
              {
                env: {
                  ANTHROPIC_AUTH_TOKEN: "generated-capability",
                  CLAUDE_CONFIG_DIR: "/generated/private",
                },
                alwaysThinkingEnabled: false,
              },
            );
            yield* Deferred.fail(
              loss,
              new AgentShareCoreError({ operation: "renew", category: "denied" }),
            );
            yield* Deferred.await(stopped);
            const failure = yield* runner.open(input).pipe(Effect.flip);
            assert.equal(failure.method, "query");
            assert.equal(requests.length, 1);
          }).pipe(
            Effect.provide(
              mockRunner({
                open: (request) =>
                  Effect.sync(() => {
                    requests.push(request);
                  }).pipe(
                    Effect.as(
                      sessionWith(
                        Effect.sync(() => {
                          closes++;
                        }).pipe(
                          Effect.andThen(Deferred.succeed(stopped, undefined)),
                          Effect.asVoid,
                        ),
                        {
                          applyFlagSettings: (value) =>
                            Effect.sync(() => {
                              changes.push(value);
                            }),
                          setModel: () =>
                            Effect.sync(() => {
                              modelChanges++;
                            }),
                        },
                      ),
                    ),
                  ),
              }),
            ),
          ),
        );
        assert.equal(closes, 1);
      }),
  );

  it.effect("closes a query that finishes opening after its lease has already failed", () =>
    Effect.gen(function* () {
      const opening = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const stopped = yield* Deferred.make<void>();
      const loss = yield* Deferred.make<never, AgentShareCoreError>();
      let closes = 0;
      let opens = 0;
      const session = sessionWith(
        Effect.sync(() => {
          closes++;
        }).pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.asVoid),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const runner = yield* managedClaudeQueries(
            { launch, keepAlive: Deferred.await(loss) },
            { env: {} },
          );
          yield* runner.open(input);
          const attempt = yield* runner.open(input).pipe(Effect.forkChild);
          yield* Deferred.await(opening);
          yield* Deferred.fail(
            loss,
            new AgentShareCoreError({ operation: "renew", category: "denied" }),
          );
          yield* Deferred.await(stopped);
          yield* Deferred.succeed(finish, undefined);
          const failure = yield* Fiber.join(attempt).pipe(Effect.flip);
          assert.equal(failure.method, "query");
        }).pipe(
          Effect.provide(
            mockRunner({
              open: () =>
                Effect.suspend(() => {
                  opens++;
                  return opens === 1
                    ? Effect.succeed(session)
                    : Deferred.succeed(opening, undefined).pipe(
                        Effect.andThen(Deferred.await(finish)),
                        Effect.as(session),
                      );
                }),
            }),
          ),
        ),
      );
      assert.equal(closes, 2);
    }),
  );
});
