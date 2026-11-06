import {
  AgentShareAccountError,
  AgentShareFundReceipt,
  AgentShareFundsCommandInput,
  AgentShareFundsReadInput,
  AgentSharePayoutStatus,
  type AgentShareFundsResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as FundsJournal from "./FundsJournal.ts";
import * as WalletClient from "./WalletClient.ts";

const isAccountError = Schema.is(AgentShareAccountError);
const decodeRead = Schema.decodeEffect(AgentShareFundsReadInput);
const decodeCommand = Schema.decodeEffect(AgentShareFundsCommandInput);
const decodePayment = Schema.decodeUnknownEffect(
  Schema.Struct({
    ...AgentShareFundReceipt.fields,
    checkout_url: Schema.optionalKey(Schema.String),
  }),
);
const decodeWithdrawal = Schema.decodeUnknownEffect(
  Schema.Union([
    AgentShareFundReceipt,
    Schema.Struct({ withdrawal: AgentShareFundReceipt, error: Schema.String }),
  ]),
);
const decodeHistory = Schema.decodeUnknownEffect(
  Schema.Struct({
    items: Schema.Array(AgentShareFundReceipt).check(Schema.isMaxLength(100)),
    next_cursor: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{0,512}$/)),
  }),
);
const decodePayout = Schema.decodeUnknownEffect(AgentSharePayoutStatus);
const decodeOnboarding = Schema.decodeUnknownEffect(Schema.Struct({ url: Schema.String }));
const failure = (category: "rejected" | "outcome-unknown" | "invalid-response") =>
  new AgentShareAccountError({ operation: "funds", category });

function handoff(raw: string, hosts: ReadonlyArray<string>): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export class FundsClient extends Context.Service<
  FundsClient,
  {
    readonly read: (
      input: AgentShareFundsReadInput,
    ) => Effect.Effect<AgentShareFundsResult, AgentShareAccountError>;
    readonly command: (
      input: AgentShareFundsCommandInput,
    ) => Effect.Effect<AgentShareFundsResult, AgentShareAccountError>;
  }
>()("@agentshare/account-client/FundsClient") {}

const make = Effect.gen(function* () {
  const wallet = yield* WalletClient.WalletClient;
  const journal = yield* FundsJournal.FundsJournal;

  const read = Effect.fn("FundsClient.read")(function* (input: AgentShareFundsReadInput) {
    const decoded = yield* decodeRead(input).pipe(Effect.mapError(() => failure("rejected")));
    return yield* wallet.withAccountSession(
      decoded.owner,
      Effect.fn("FundsClient.readSession")(function* (session) {
        const operation = yield* journal.read(session.identity);
        if (decoded.action === "read" || !operation || operation.state === "prepared")
          return { owner: decoded.owner, operation };
        const id = FundsJournal.fundRequestId(session.identity, operation.intent);
        const seen = new Set<string>();
        let cursor = "";
        for (let page = 0; page < 200; page++) {
          const query = new URLSearchParams({
            kind: operation.intent.action === "topup" ? "topups" : "withdrawals",
            cursor,
          });
          const history = yield* session.request(`/v1/market/history?${query}`).pipe(
            Effect.flatMap(decodeHistory),
            Effect.mapError((cause) =>
              isAccountError(cause) ? cause : failure("invalid-response"),
            ),
          );
          const receipt = history.items.find((item) => item.id === id);
          if (receipt) {
            const confirmed = yield* journal.confirm(
              session.identity,
              operation.intent.key,
              receipt,
            );
            return { owner: decoded.owner, operation: confirmed };
          }
          if (!history.next_cursor) return yield* failure("outcome-unknown");
          if (seen.has(history.next_cursor)) return yield* failure("invalid-response");
          seen.add(history.next_cursor);
          cursor = history.next_cursor;
        }
        return yield* failure("outcome-unknown");
      }),
    );
  });

  const command = Effect.fn("FundsClient.command")(function* (input: AgentShareFundsCommandInput) {
    const decoded = yield* decodeCommand(input).pipe(Effect.mapError(() => failure("rejected")));
    return yield* wallet.withAccountSession(
      decoded.owner,
      Effect.fn("FundsClient.commandSession")(function* (session) {
        if (decoded.action === "prepare")
          return {
            owner: decoded.owner,
            operation: yield* journal.prepare(session.identity, decoded.intent),
          };
        if (decoded.action === "cancel") {
          yield* journal.cancel(session.identity, decoded.key);
          return { owner: decoded.owner, operation: null };
        }
        if (decoded.action === "payoutStatus") {
          const payout = yield* session.request("/v1/market/payout/status", {}).pipe(
            Effect.flatMap(decodePayout),
            Effect.mapError(() => failure("invalid-response")),
          );
          return { owner: decoded.owner, operation: yield* journal.read(session.identity), payout };
        }
        if (decoded.action === "onboarding") {
          const link = yield* session
            .request("/v1/market/payout/onboarding", { country: decoded.country })
            .pipe(
              Effect.flatMap(decodeOnboarding),
              Effect.mapError(() => failure("outcome-unknown")),
            );
          const url = handoff(link.url, ["connect.stripe.com", "dashboard.stripe.com"]);
          if (!url) return yield* failure("invalid-response");
          return {
            owner: decoded.owner,
            operation: yield* journal.read(session.identity),
            handoff_url: url,
          };
        }
        let operation = yield* journal.read(session.identity);
        if (!operation || operation.intent.key !== decoded.key) return yield* failure("rejected");
        const initiallyPrepared = operation.state === "prepared";
        if (decoded.action === "submit") {
          if (operation.state === "unconfirmed" && decoded.retry) {
            const submitted = Date.parse(operation.submitted_at ?? "");
            const now = DateTime.toEpochMillis(yield* DateTime.now);
            if (
              !Number.isFinite(submitted) ||
              submitted > now ||
              now - submitted >= 23 * 60 * 60 * 1000
            )
              return yield* failure("outcome-unknown");
          }
          operation = yield* journal.submit(session.identity, decoded.key, decoded.retry);
          if (operation.state === "confirmed") return { owner: decoded.owner, operation };
        } else {
          if (operation.state !== "confirmed" || !operation.receipt)
            return yield* failure("rejected");
          if (
            decoded.action === "resumeCheckout" &&
            (operation.intent.action !== "topup" || operation.receipt.status !== "pending")
          )
            return yield* failure("rejected");
          if (
            decoded.action === "retryWithdrawal" &&
            (operation.intent.action !== "withdraw" ||
              !["requested", "processing"].includes(operation.receipt.status))
          )
            return yield* failure("rejected");
          const created = Date.parse(operation.receipt.created_at ?? "");
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          if (!Number.isFinite(created) || created > now || now - created >= 23 * 60 * 60 * 1000)
            return yield* failure("outcome-unknown");
        }
        const intent = operation.intent;
        const retryWithdrawal = decoded.action === "retryWithdrawal";
        const raw = yield* session
          .request(
            retryWithdrawal
              ? `/v1/market/withdrawals/${FundsJournal.fundRequestId(session.identity, intent)}/retry`
              : intent.action === "topup"
                ? "/v1/market/topups"
                : "/v1/market/withdrawals",
            retryWithdrawal ? {} : { currency: intent.currency, amount_minor: intent.amount_minor },
            retryWithdrawal ? undefined : intent.key,
          )
          .pipe(
            Effect.tapError(
              Effect.fn("FundsClient.recordRejection")(function* (error) {
                // These creation failures precede any persisted platform operation; conflicts stay uncertain.
                if (
                  decoded.action === "submit" &&
                  initiallyPrepared &&
                  error.status !== undefined &&
                  [400, 401, 402, 403].includes(error.status)
                )
                  yield* journal.reject(session.identity, intent.key);
              }),
            ),
            Effect.mapError((error) =>
              error.status !== undefined && error.status >= 500
                ? new AgentShareAccountError({
                    operation: "funds",
                    category: "outcome-unknown",
                    status: error.status,
                    cause: error,
                  })
                : error,
            ),
          );

        if (intent.action === "topup") {
          const payment = yield* decodePayment(raw).pipe(
            Effect.mapError(() => failure("outcome-unknown")),
          );
          const confirmed = yield* journal.confirm(session.identity, intent.key, payment);
          const url = payment.checkout_url
            ? handoff(payment.checkout_url, ["checkout.stripe.com"])
            : undefined;
          if (payment.status === "pending" && !url) return yield* failure("invalid-response");
          return {
            owner: decoded.owner,
            operation: confirmed,
            ...(payment.status === "pending" && url ? { handoff_url: url } : {}),
          };
        }
        const withdrawal = yield* decodeWithdrawal(raw).pipe(
          Effect.mapError(() => failure("outcome-unknown")),
        );
        const receipt = "withdrawal" in withdrawal ? withdrawal.withdrawal : withdrawal;
        return {
          owner: decoded.owner,
          operation: yield* journal.confirm(session.identity, intent.key, receipt),
        };
      }),
    );
  });

  return FundsClient.of({ read, command });
});

export const layer = Layer.effect(FundsClient, make);
