// @effect-diagnostics nodeBuiltinImport:off - A raw loopback server verifies redirect refusal and exact transport requests.
import * as NodeHttp from "node:http";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as LocalTextModel from "./LocalTextModel.ts";

const model = { id: "generated", service: "local", source: "local", runtime: "text" } as const;
const isCoreError = Schema.is(AgentShareCoreError);
const input = {
  owner: "generated-owner",
  model,
  directory: "/generated/work",
  messages: [{ role: "user" as const, content: "What is two plus two?" }],
};
const identity = {
  api_version: 1 as const,
  device_id: "generated-device",
  stopping: false,
  owner: input.owner,
  paired: false,
  version: "generated",
  revision: "generated",
  features: [],
};

const fixture = Effect.fn("LocalTextModelTest.fixture")(function* (
  handler: NodeHttp.RequestListener,
) {
  const server = yield* Effect.acquireRelease(
    Effect.tryPromise(
      () =>
        new Promise<NodeHttp.Server>((resolve, reject) => {
          const server = NodeHttp.createServer(handler);
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve(server));
        }),
    ),
    (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return `http://127.0.0.1:${address.port}/v1`;
});

function lease(base_url: string): CoreClient.ModelLease {
  return {
    id: "generated-lease",
    service: "text",
    model: model.id,
    directory: input.directory,
    local_model: true,
    max_output_tokens: 128,
    connection: { base_url, api_key: "generated-model-only-key" },
  };
}

describe("local text model transport", () => {
  it.live("sends text only through a model-scoped loopback lease and releases it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requests: {
          path: string | undefined;
          authorization: string | undefined;
          body: unknown;
        }[] = [];
        const releases: string[] = [];
        const url = yield* fixture((request, response) => {
          let raw = "";
          request.setEncoding("utf8");
          request.on("data", (chunk) => {
            raw += chunk;
          });
          request.on("end", () => {
            requests.push({
              path: request.url,
              authorization: request.headers.authorization,
              body: JSON.parse(raw),
            });
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ choices: [{ message: { content: "Four." } }] }));
          });
        });
        const answer = yield* LocalTextModel.complete(input).pipe(
          Effect.provide(
            Layer.mock(CoreClient.CoreClient)({
              identity: () => Effect.succeed(identity),
              acquireModel: () => Effect.succeed(lease(url)),
              releaseModel: (id) =>
                Effect.sync(() => {
                  releases.push(id);
                }),
            }),
          ),
        );
        assert.equal(answer, "Four.");
        assert.deepEqual(requests, [
          {
            path: "/v1/chat/completions",
            authorization: "Bearer generated-model-only-key",
            body: { model: "generated", messages: input.messages, max_tokens: 128, stream: false },
          },
        ]);
        assert.deepEqual(releases, ["generated-lease"]);
      }),
    ),
  );

  it.effect("rejects a different account or a nonlocal model before acquiring a lease", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const layer = Layer.mock(CoreClient.CoreClient)({
        identity: () => Effect.succeed({ ...identity, owner: "another-owner" }),
        acquireModel: () => {
          acquisitions++;
          return Effect.succeed(lease("http://127.0.0.1:1/v1"));
        },
      });
      const denied = yield* LocalTextModel.complete(input).pipe(Effect.provide(layer), Effect.flip);
      assert.equal(denied.category, "denied");
      const remote = yield* LocalTextModel.complete({
        ...input,
        model: { ...model, source: "community" },
      }).pipe(Effect.provide(layer), Effect.flip);
      assert.equal(remote.category, "invalid-operation");
      assert.equal(acquisitions, 0);
    }),
  );

  it.live("rejects redirects and tool replies without following or retrying them", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let requests = 0;
        const releases: string[] = [];
        const url = yield* fixture((_request, response) => {
          requests++;
          if (requests === 1) {
            response.writeHead(307, { Location: "/v1/elsewhere" });
            response.end();
          } else {
            response.setHeader("Content-Type", "application/json");
            response.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: "Four.",
                      tool_calls: [{ type: "function", function: { name: "shell" } }],
                    },
                  },
                ],
              }),
            );
          }
        });
        const layer = Layer.mock(CoreClient.CoreClient)({
          identity: () => Effect.succeed(identity),
          acquireModel: () => Effect.succeed(lease(url)),
          releaseModel: (id) =>
            Effect.sync(() => {
              releases.push(id);
            }),
        });
        for (let i = 0; i < 2; i++) {
          const failure = yield* LocalTextModel.complete(input).pipe(
            Effect.provide(layer),
            Effect.flip,
          );
          assert.ok(isCoreError(failure));
          assert.equal(failure.category, "invalid-response");
          assert.equal(requests, i + 1);
        }
        assert.deepEqual(releases, ["generated-lease", "generated-lease"]);
      }),
    ),
  );
});
