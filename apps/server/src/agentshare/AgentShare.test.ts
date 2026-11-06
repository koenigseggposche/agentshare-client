import * as TerminalManager from "../terminal/Manager.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ServerSettings from "../serverSettings.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as AgentShare from "./AgentShare.ts";

const encodeCoreError = Schema.encodeEffect(AgentShareCoreError);

describe("AgentShare public service", () => {
  it.effect.each(["identity", "read", "command"] as const)(
    "does not serialize private HTTP failure details from $0",
    (operation) =>
      Effect.gen(function* () {
        const privateFailure = new AgentShareCoreError({
          operation,
          category: "denied",
          status: 403,
          cause: new Error("Authorization: Bearer generated-private-capability"),
        });
        const service = yield* AgentShare.AgentShare.pipe(
          Effect.provide(
            AgentShare.layer.pipe(
              Layer.provide(NodeServices.layer),
              Layer.provide(Layer.mock(TerminalManager.TerminalManager)({})),
              Layer.provide(NodeCrypto.layer),
              Layer.provide(Layer.mock(ServerSettings.ServerSettingsService)({})),
              Layer.provide(
                Layer.mock(CoreClient.CoreClient)({
                  identity: () => Effect.fail(privateFailure),
                  read: () => Effect.fail(privateFailure),
                  command: () => Effect.fail(privateFailure),
                }),
              ),
            ),
          ),
        );
        const failure = yield* (
          operation === "identity"
            ? service.getState()
            : operation === "read"
              ? service.read("status")
              : service.command({ operation: "signOut" })
        ).pipe(Effect.flip);
        assert.equal(failure.category, "denied");
        assert.equal(failure.status, 403);
        assert.isUndefined(failure.cause);
        const encoded = yield* encodeCoreError(failure);
        assert.notInclude(JSON.stringify(encoded), "generated-private-capability");
      }),
  );
});

it.effect.each(["codex", "claude", "text"] as const)(
  "configures an immutable $0 source for the current owner and rejects a stale account selection",
  (runtime) =>
    Effect.gen(function* () {
      const settings = yield* ServerSettings.ServerSettingsService;
      const model = {
        id: "generated",
        source: runtime === "text" ? ("local" as const) : ("community" as const),
        service: runtime === "text" ? ("local" as const) : runtime,
        runtime,
      };
      let catalogs = 0;
      const service = yield* AgentShare.AgentShare.pipe(
        Effect.provide(
          AgentShare.layer.pipe(
            Layer.provide(NodeServices.layer),
            Layer.provide(Layer.mock(TerminalManager.TerminalManager)({})),
            Layer.provide(
              Layer.mock(CoreClient.CoreClient)({
                identity: () =>
                  Effect.succeed({
                    api_version: 1,
                    version: "generated",
                    revision: "generated",
                    owner: "generated-owner",
                    device_id: "generated-device",
                    paired: runtime !== "text",
                    stopping: false,
                    features: [],
                  }),
                models: () =>
                  Effect.sync(() => {
                    catalogs++;
                    return {
                      models: [
                        {
                          model,
                          name: "Generated",
                          available: true,
                          runtimes: [runtime],
                          subagents: true,
                          search: false,
                        },
                      ],
                      diagnostics: [],
                    };
                  }),
              }),
            ),
          ),
        ),
      );
      const denied = yield* service
        .configureModel({ owner: "previous-owner", model })
        .pipe(Effect.flip);
      assert.equal(denied.category, "denied");
      assert.equal(catalogs, 0);
      const first = yield* service.configureModel({ owner: "generated-owner", model });
      const repeated = yield* service.configureModel({ owner: "generated-owner", model });
      assert.equal(first.instanceId, repeated.instanceId);
      const configured = yield* settings.getSettings;
      assert.equal(Object.keys(configured.providerInstances).length, 1);
      assert.deepInclude(configured.providerInstances[first.instanceId]?.config, {
        agentShareOwner: "generated-owner",
        agentShareModel: model,
      });
      assert.equal(
        configured.providerInstances[first.instanceId]?.driver,
        runtime === "text" ? "agentshareText" : runtime === "claude" ? "claudeAgent" : "codex",
      );
      assert.equal(configured.idleCompaction, "off");
      assert.equal(configured.branchNamingMode, "static");
      const other = yield* service
        .configureModel({
          owner: "generated-owner",
          model: { ...model, source: "owned", device: "generated-other-host" },
        })
        .pipe(Effect.flip);
      assert.equal(other.category, runtime === "text" ? "invalid-operation" : "denied");
    }).pipe(Effect.provide(Layer.mergeAll(ServerSettings.layerTest(), NodeCrypto.layer))),
);
