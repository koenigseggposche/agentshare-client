import * as Schema from "effect/Schema";

const Currency = Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/));
const Key = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
);
const Amount = Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 100000 }));
const WithdrawalAmount = Schema.Int.check(
  Schema.isBetween({ minimum: 100, maximum: 1_000_000_000 }),
);

export const AgentShareFundIntent = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("topup"),
    key: Key,
    currency: Currency,
    amount_minor: Amount,
  }),
  Schema.Struct({
    action: Schema.Literal("withdraw"),
    key: Key,
    currency: Currency,
    amount_minor: WithdrawalAmount,
  }),
]);
export type AgentShareFundIntent = typeof AgentShareFundIntent.Type;

export const AgentShareFundReceipt = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^(?:topup|withdraw)_[a-f0-9]{32}$/)),
  currency: Currency,
  amount_minor: WithdrawalAmount,
  status: Schema.String,
  created_at: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentShareFundReceipt = typeof AgentShareFundReceipt.Type;

export const AgentShareFundOperation = Schema.Struct({
  intent: AgentShareFundIntent,
  state: Schema.Literals(["prepared", "unconfirmed", "confirmed"]),
  receipt: Schema.optionalKey(AgentShareFundReceipt),
  submitted_at: Schema.optionalKey(Schema.String),
});
export type AgentShareFundOperation = typeof AgentShareFundOperation.Type;

export const AgentSharePayoutStatus = Schema.Struct({
  ready: Schema.Boolean,
  country: Schema.optionalKey(Schema.String),
  created_at: Schema.optionalKey(Schema.String),
  checked_at: Schema.optionalKey(Schema.String),
});
export type AgentSharePayoutStatus = typeof AgentSharePayoutStatus.Type;

export const AgentShareFundsReadInput = Schema.Struct({
  owner: Schema.String,
  action: Schema.Literals(["read", "reconcile"]),
});
export type AgentShareFundsReadInput = typeof AgentShareFundsReadInput.Type;

export const AgentShareFundsCommandInput = Schema.Union([
  Schema.Struct({
    owner: Schema.String,
    action: Schema.Literal("prepare"),
    intent: AgentShareFundIntent,
  }),
  Schema.Struct({ owner: Schema.String, action: Schema.Literal("cancel"), key: Key }),
  Schema.Struct({
    owner: Schema.String,
    action: Schema.Literal("submit"),
    key: Key,
    retry: Schema.Boolean,
  }),
  Schema.Struct({
    owner: Schema.String,
    action: Schema.Literals(["resumeCheckout", "retryWithdrawal"]),
    key: Key,
  }),
  Schema.Struct({
    owner: Schema.String,
    action: Schema.Literal("onboarding"),
    country: Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/)),
  }),
  Schema.Struct({ owner: Schema.String, action: Schema.Literal("payoutStatus") }),
]);
export type AgentShareFundsCommandInput = typeof AgentShareFundsCommandInput.Type;

export const AgentShareFundsResult = Schema.Struct({
  owner: Schema.String,
  operation: Schema.NullOr(AgentShareFundOperation),
  handoff_url: Schema.optionalKey(Schema.String),
  payout: Schema.optionalKey(AgentSharePayoutStatus),
});
export type AgentShareFundsResult = typeof AgentShareFundsResult.Type;
