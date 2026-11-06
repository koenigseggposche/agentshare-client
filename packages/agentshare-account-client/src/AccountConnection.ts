import type { AgentShareAccountError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface AccountIdentity {
  readonly owner: string;
  readonly consoleUrl: string;
  readonly deviceId: string;
  readonly userId: string;
}

export class AccountConnection extends Context.Service<
  AccountConnection,
  {
    readonly identity: () => Effect.Effect<AccountIdentity, AgentShareAccountError>;
    readonly sessionTicket: (owner: string) => Effect.Effect<string, AgentShareAccountError>;
  }
>()("@agentshare/account-client/AccountConnection") {}
