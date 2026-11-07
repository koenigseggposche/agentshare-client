import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import { agentShareTaskId } from "@t3tools/shared/agentShareTaskId";
import { assert, describe, it } from "@effect/vitest";
import * as TestClock from "effect/testing/TestClock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as NativeSessions from "./NativeSessions.ts";

const launch: CoreClient.NativeLaunch = {
  id: "generated-lease",
  owner: "generated-owner",
  service: "codex",
  model: "generated",
  binary: "/generated/codex",
  args: ["app-server"],
  directory: "/generated/work",
  environment: { AGENTSHARE_APPLICATION_KEY: "generated-route-capability" },
};

describe("native model sessions", () => {
  it.effect.each([
    { field: "owner", response: { ...launch, owner: "different-owner" }, task: undefined },
    { field: "runtime", response: { ...launch, service: "claude" as const }, task: undefined },
    { field: "task", response: { ...launch, workbench_task_id: "different-task" }, task: "task:1" },
    { field: "task on an older Core", response: launch, task: "task:1" },
  ])("rejects a launch for a different $field and releases its lease", ({ response, task }) =>
    Effect.gen(function* () {
      const releases: string[] = [];
      const failure = yield* Effect.scoped(
        Effect.gen(function* () {
          const service = yield* NativeSessions.NativeSessions;
          return yield* service.acquire({
            owner: launch.owner,
            ...(task === undefined ? {} : { workbench_task_id: task }),
            model: { id: "generated", service: "codex", source: "community", runtime: "codex" },
            directory: launch.directory,
          });
        }).pipe(
          Effect.provide(
            NativeSessions.layer.pipe(
              Layer.provide(
                Layer.mock(CoreClient.CoreClient)({
                  acquireNative: () => Effect.succeed(response),
                  releaseModel: (id) =>
                    Effect.sync(() => {
                      releases.push(id);
                    }),
                }),
              ),
            ),
          ),
        ),
      ).pipe(Effect.flip);
      assert.equal(failure.category, "denied");
      assert.deepEqual(releases, [launch.id]);
    }),
  );
  it.effect(
    "releases the lease when its process scope exits and stops renewing after lease loss",
    () =>
      Effect.gen(function* () {
        let renewals = 0;
        const runId = "run:thread:mcp%3Agenerated:ordinal:1";
        const billingId = agentShareTaskId(runId);
        const releases: string[] = [];
        yield* Effect.scoped(
          Effect.gen(function* () {
            const service = yield* NativeSessions.NativeSessions;
            const lease = yield* service.acquire({
              owner: "generated-owner",
              model: { id: "generated", service: "codex", source: "community", runtime: "codex" },
              directory: "/generated/work",
              workbench_task_id: runId,
            });
            assert.equal(
              lease.launch.environment.AGENTSHARE_APPLICATION_KEY,
              "generated-route-capability",
            );
            const heartbeat = yield* lease.keepAlive.pipe(Effect.forkChild);
            yield* TestClock.adjust("15 seconds");
            const failure = yield* Fiber.join(heartbeat).pipe(Effect.flip);
            assert.equal(failure.category, "rejected");
            assert.equal(renewals, 1);
            assert.deepEqual(releases, []);
          }).pipe(
            Effect.provide(
              NativeSessions.layer.pipe(
                Layer.provide(
                  Layer.mock(CoreClient.CoreClient)({
                    acquireNative: (request) => {
                      assert.equal(request.workbench_task_id, billingId);
                      return Effect.succeed({ ...launch, workbench_task_id: billingId });
                    },
                    renewModel: () =>
                      Effect.sync(() => {
                        renewals++;
                      }).pipe(
                        Effect.andThen(
                          Effect.fail(
                            new AgentShareCoreError({
                              operation: "renew",
                              category: "rejected",
                              status: 404,
                            }),
                          ),
                        ),
                      ),
                    releaseModel: (id) =>
                      Effect.sync(() => {
                        releases.push(id);
                      }),
                  }),
                ),
              ),
            ),
          ),
        );
        assert.deepEqual(releases, [launch.id]);
      }),
  );
});
