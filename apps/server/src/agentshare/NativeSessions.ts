import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError, type AgentShareModel } from "@t3tools/contracts";
import { agentShareTaskId } from "@t3tools/shared/agentShareTaskId";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import { layerLocalCore } from "./LocalCore.ts";

export class NativeSessions extends Context.Service<
  NativeSessions,
  {
    readonly acquire: (input: {
      readonly owner: string;
      readonly workbench_task_id?: string;
      readonly model: AgentShareModel;
      readonly directory: string;
    }) => Effect.Effect<
      {
        readonly launch: CoreClient.NativeLaunch;
        readonly keepAlive: Effect.Effect<never, AgentShareCoreError>;
      },
      AgentShareCoreError,
      Scope.Scope
    >;
  }
>()("t3/agentshare/NativeSessions") {}

export const layer = Layer.effect(
  NativeSessions,
  Effect.gen(function* () {
    const core = yield* CoreClient.CoreClient;
    return NativeSessions.of({
      acquire: Effect.fn("NativeSessions.acquire")(function* (input) {
        const request =
          input.workbench_task_id === undefined
            ? input
            : { ...input, workbench_task_id: agentShareTaskId(input.workbench_task_id) };
        const launch = yield* Effect.acquireRelease(core.acquireNative(request), (lease) =>
          core.releaseModel(lease.id).pipe(Effect.ignore),
        );
        if (
          launch.owner !== input.owner ||
          launch.service !== input.model.runtime ||
          launch.workbench_task_id !== request.workbench_task_id
        )
          return yield* new AgentShareCoreError({ operation: "acquireNative", category: "denied" });
        const keepAlive = Effect.forever(
          Effect.sleep("15 seconds").pipe(Effect.andThen(core.renewModel(launch.id))),
        );
        return { launch, keepAlive };
      }),
    });
  }),
);
export const layerLocal = layer.pipe(Layer.provide(layerLocalCore));
