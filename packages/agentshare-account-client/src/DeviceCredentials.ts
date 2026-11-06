import { AgentShareAccountError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export class DeviceCredentials extends Context.Service<
  DeviceCredentials,
  {
    readonly load: () => Effect.Effect<string | null, AgentShareAccountError>;
    readonly save: (value: string) => Effect.Effect<void, AgentShareAccountError>;
    readonly clear: () => Effect.Effect<void, AgentShareAccountError>;
  }
>()("@agentshare/account-client/DeviceCredentials") {}

export class DeviceLoginConfig extends Context.Service<
  DeviceLoginConfig,
  {
    readonly consoleUrl: string;
    readonly deviceName: string;
    readonly verifier: () => Effect.Effect<string, AgentShareAccountError>;
  }
>()("@agentshare/account-client/DeviceCredentials/DeviceLoginConfig") {}
