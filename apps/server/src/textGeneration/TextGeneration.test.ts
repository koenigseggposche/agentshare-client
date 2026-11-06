import { assert, describe, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "./TextGeneration.ts";

describe("auxiliary generation policy", () => {
  it.effect("refuses AgentShare auxiliary requests before quota checks or fallback selection", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("as_generated");
      const service = yield* TextGeneration.TextGeneration.pipe(
        Effect.provide(
          TextGeneration.layer.pipe(
            Layer.provide(
              Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
                listInstances: Effect.die("Unexpected auxiliary model selection"),
              }),
            ),
            Layer.provide(
              Layer.mock(SourceControlProviderRegistry.SourceControlProviderRegistry)({
                resolveLink: () => Effect.die("Unexpected link resolution"),
              }),
            ),
            Layer.provide(
              Layer.mock(ServerSettings.ServerSettingsService)({
                getSettings: Effect.succeed({
                  ...DEFAULT_SERVER_SETTINGS,
                  providerInstances: {
                    [instanceId]: {
                      driver: ProviderDriverKind.make("codex"),
                      config: {
                        agentShareOwner: "generated-owner",
                        agentShareModel: {
                          id: "generated",
                          source: "community",
                          service: "codex",
                          runtime: "codex",
                        },
                      },
                    },
                  },
                }),
              }),
            ),
          ),
        ),
      );
      const failure = yield* service
        .generateCommitMessage({
          cwd: "/generated/work",
          branch: null,
          stagedSummary: "",
          stagedPatch: "",
          modelSelection: { instanceId, model: "generated" },
        })
        .pipe(Effect.flip);
      assert.equal(failure.operation, "generateCommitMessage");
      assert.include(failure.detail, "disabled");
    }),
  );
});
