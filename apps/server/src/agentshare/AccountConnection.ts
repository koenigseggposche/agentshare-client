import * as AccountConnection from "@agentshare/account-client/AccountConnection";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareAccountError, AgentShareDeviceStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { layerLocalCore } from "./LocalCore.ts";

const isAccountError = Schema.is(AgentShareAccountError);

const layer = Layer.effect(
  AccountConnection.AccountConnection,
  Effect.gen(function* () {
    const core = yield* CoreClient.CoreClient;
    const identity = Effect.fn("AccountConnection.identity")(
      function* () {
        const host = yield* core.identity();
        if (!host.paired || host.owner === "offline")
          return yield* new AgentShareAccountError({
            operation: "identity",
            category: "sign-in-required",
          });
        const status = yield* core
          .read("status")
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(AgentShareDeviceStatus)));
        const profile = yield* core
          .read("profile")
          .pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ user_id: Schema.String }))),
          );
        const after = yield* core.identity();
        if (
          !after.paired ||
          after.owner !== host.owner ||
          after.device_id !== host.device_id ||
          status.device_id !== host.device_id
        )
          return yield* new AgentShareAccountError({
            operation: "identity",
            category: "account-changed",
          });
        return {
          owner: host.owner,
          deviceId: host.device_id,
          userId: profile.user_id,
          consoleUrl: status.console_url,
        };
      },
      Effect.mapError((cause) =>
        isAccountError(cause)
          ? cause
          : new AgentShareAccountError({ operation: "identity", category: "unavailable", cause }),
      ),
    );
    return AccountConnection.AccountConnection.of({
      identity,
      sessionTicket: Effect.fn("AccountConnection.sessionTicket")((owner: string) =>
        core.consoleSession(owner).pipe(
          Effect.mapError(
            (cause) =>
              new AgentShareAccountError({
                operation: "session",
                category: cause.category === "denied" ? "sign-in-required" : "unavailable",
                cause,
              }),
          ),
        ),
      ),
    });
  }),
);

export const layerCore = layer.pipe(Layer.provide(layerLocalCore));
