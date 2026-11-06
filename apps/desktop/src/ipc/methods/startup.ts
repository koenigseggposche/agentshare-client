import { DesktopStartupStateSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopStartup from "../../app/DesktopStartup.ts";
import * as Channels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const getStartupState = makeIpcMethod({
  channel: Channels.GET_STARTUP_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopStartupStateSchema,
  handler: Effect.fn("desktop.ipc.startup.get")(function* () {
    return yield* (yield* DesktopStartup.DesktopStartup).get;
  }),
});

export const setStartupEnabled = makeIpcMethod({
  channel: Channels.SET_STARTUP_ENABLED_CHANNEL,
  payload: Schema.Boolean,
  result: DesktopStartupStateSchema,
  handler: Effect.fn("desktop.ipc.startup.set")(function* (enabled) {
    return yield* (yield* DesktopStartup.DesktopStartup).set(enabled);
  }),
});
