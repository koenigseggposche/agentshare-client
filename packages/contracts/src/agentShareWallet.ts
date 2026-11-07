import { AgentSharePayoutStatus } from "./agentShareFunds.ts";
import * as Schema from "effect/Schema";

const Amount = Schema.Int.check(
  Schema.isBetween({ minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
);
const Count = Amount.check(Schema.isGreaterThanOrEqualTo(0));
const Currency = Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/));
const Cursor = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{0,512}$/));
export const AgentShareWorkbenchTaskId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_.:-]{1,160}$/),
);
const RequestId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,128}$/));

export const AgentShareWalletRecord = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  request_id: Schema.optionalKey(Schema.String),
  service: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  rate: Schema.optionalKey(Schema.Struct({ model: Schema.String })),
  currency: Schema.optionalKey(Currency),
  status: Schema.optionalKey(Schema.String),
  started_at: Schema.optionalKey(Schema.String),
  created_at: Schema.optionalKey(Schema.String),
  charged_micros: Schema.optionalKey(Count),
  earned_micros: Schema.optionalKey(Count),
  amount_minor: Schema.optionalKey(Count),
  amount_micros: Schema.optionalKey(Amount),
  reason: Schema.optionalKey(Schema.String),
  before_micros: Schema.optionalKey(Amount),
  after_micros: Schema.optionalKey(Amount),
});
export type AgentShareWalletRecord = typeof AgentShareWalletRecord.Type;
const Records = Schema.Array(AgentShareWalletRecord).check(Schema.isMaxLength(100));

export const AgentShareWalletHistoryKind = Schema.Literals([
  "spending",
  "earnings",
  "topups",
  "withdrawals",
  "operator_credits",
]);
export type AgentShareWalletHistoryKind = typeof AgentShareWalletHistoryKind.Type;

export const AgentSharePaymentPreference = Schema.Struct({
  currency: Currency,
  earnings_first: Schema.Boolean,
  version: Count,
});

export const AgentShareWalletOverview = Schema.Struct({
  currency: Currency,
  wallets: Schema.Array(
    Schema.Struct({
      currency: Currency,
      available_micros: Amount,
      held_micros: Count,
      pending_earnings_micros: Count,
      available_earnings_micros: Count,
      withdrawal_held_micros: Count,
    }),
  ).check(Schema.isMaxLength(32)),
  summary: Schema.Struct({ spent_micros: Count, earned_micros: Count, requests: Count }),
  spending: Records,
  earnings: Records,
  topups: Records,
  withdrawals: Records,
  operator_credits: Records,
  history_cursors: Schema.Struct({
    spending: Cursor,
    earnings: Cursor,
    topups: Cursor,
    withdrawals: Cursor,
    operator_credits: Cursor,
  }),
  checkout_enabled: Schema.Boolean,
  payouts_enabled: Schema.Boolean,
  payout_countries: Schema.optionalKey(
    Schema.NullOr(Schema.Array(Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/)))),
  ),
  payout_account: Schema.optionalKey(AgentSharePayoutStatus),
  payment_preference: AgentSharePaymentPreference,
});
export type AgentShareWalletOverview = typeof AgentShareWalletOverview.Type;

export const AgentShareWalletDetail = Schema.Struct({
  ...AgentShareWalletRecord.fields,
  request_id: RequestId,
  currency: Currency,
  status: Schema.String,
  charged_micros: Count,
  earned_micros: Count,
  settlement_policy: Schema.Literals(["community_split", "owner_platform_only"]),
  earnings_paid_micros: Schema.optionalKey(Count),
  prepaid_paid_micros: Schema.optionalKey(Count),
  usage: Schema.Struct({
    state: Schema.optionalKey(Schema.String),
    estimated: Schema.optionalKey(Schema.Boolean),
    input_includes_cache: Schema.optionalKey(Schema.Boolean),
    input_tokens: Schema.optionalKey(Count),
    output_tokens: Schema.optionalKey(Count),
    cache_read_input_tokens: Schema.optionalKey(Count),
    cache_creation_input_tokens: Schema.optionalKey(Count),
    cache_creation_5m_input_tokens: Schema.optionalKey(Count),
    cache_creation_1h_input_tokens: Schema.optionalKey(Count),
  }),
  rate: Schema.Struct({
    model: Schema.optionalKey(Schema.String),
    input_micros_per_million: Count,
    output_micros_per_million: Count,
    provider_share_bps: Count,
    cache_rates: Schema.optionalKey(
      Schema.Struct({
        read_micros_per_million: Count,
        creation_5m_micros_per_million: Count,
        creation_1h_micros_per_million: Count,
      }),
    ),
  }),
});
export type AgentShareWalletDetail = typeof AgentShareWalletDetail.Type;

export const AgentShareAccountDevice = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,160}$/)),
  name: Schema.String,
  created_at: Schema.String,
  expires_at: Schema.optionalKey(Schema.String),
  revoked_at: Schema.optionalKey(Schema.String),
});
export type AgentShareAccountDevice = typeof AgentShareAccountDevice.Type;
export const AgentShareAccountDevices = Schema.Struct({
  devices: Schema.Array(AgentShareAccountDevice).check(Schema.isMaxLength(10000)),
});

export const AgentShareWalletReadInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("overview"), owner: Schema.String }),
  Schema.Struct({ action: Schema.Literal("devices"), owner: Schema.String }),
  Schema.Struct({
    action: Schema.Literal("history"),
    owner: Schema.String,
    kind: AgentShareWalletHistoryKind,
    cursor: Cursor,
    workbench_task_id: Schema.optionalKey(AgentShareWorkbenchTaskId),
  }),
  Schema.Struct({ action: Schema.Literal("detail"), owner: Schema.String, request_id: RequestId }),
]);
export type AgentShareWalletReadInput = typeof AgentShareWalletReadInput.Type;
export const AgentShareWalletReadResult = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("devices"),
    owner: Schema.String,
    data: Schema.Struct({
      ...AgentShareAccountDevices.fields,
      current_device_id: Schema.String,
    }),
  }),
  Schema.Struct({
    action: Schema.Literal("overview"),
    owner: Schema.String,
    data: AgentShareWalletOverview,
  }),
  Schema.Struct({
    action: Schema.Literal("history"),
    owner: Schema.String,
    kind: AgentShareWalletHistoryKind,
    data: Schema.Struct({ items: Records, next_cursor: Cursor }),
  }),
  Schema.Struct({
    action: Schema.Literal("detail"),
    owner: Schema.String,
    data: AgentShareWalletDetail,
  }),
]);
export type AgentShareWalletReadResult = typeof AgentShareWalletReadResult.Type;

export const AgentShareWalletCommandInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("revokeDevice"),
    owner: Schema.String,
    device_id: AgentShareAccountDevice.fields.id,
  }),
  Schema.Struct({
    action: Schema.Literal("paymentPreference"),
    owner: Schema.String,
    currency: Currency,
    earnings_first: Schema.Boolean,
  }),
]);
export type AgentShareWalletCommandInput = typeof AgentShareWalletCommandInput.Type;
export const AgentShareWalletCommandResult = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("revokeDevice"),
    owner: Schema.String,
    data: Schema.Struct({ device_id: AgentShareAccountDevice.fields.id, ok: Schema.Literal(true) }),
  }),
  Schema.Struct({
    action: Schema.Literal("paymentPreference"),
    owner: Schema.String,
    data: AgentSharePaymentPreference,
  }),
]);
export type AgentShareWalletCommandResult = typeof AgentShareWalletCommandResult.Type;

export class AgentShareAccountError extends Schema.TaggedError<AgentShareAccountError>()(
  "AgentShareAccountError",
  {
    operation: Schema.String,
    category: Schema.Literals([
      "sign-in-required",
      "account-changed",
      "invalid-response",
      "unavailable",
      "rejected",
      "outcome-unknown",
    ]),
    status: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    return `AgentShare account: ${this.category} (${this.operation}).`;
  }
}
