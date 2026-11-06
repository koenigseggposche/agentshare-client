import { sha256 } from "@noble/hashes/sha2";
import {
  AgentShareAccountError,
  AgentShareFundIntent,
  AgentShareFundOperation,
  AgentShareFundReceipt,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Hex from "effect/encoding/Hex";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import type { AccountIdentity } from "./AccountConnection.ts";

/** Implementations must replace the complete value atomically and keep it private to the device. */
export class FundsJournalStorage extends Context.Service<
  FundsJournalStorage,
  {
    readonly load: () => Effect.Effect<string | null, AgentShareAccountError>;
    readonly save: (
      value: string,
      expected: string | null,
    ) => Effect.Effect<void, AgentShareAccountError>;
  }
>()("@agentshare/account-client/FundsJournal/FundsJournalStorage") {}

const StoredOperation = Schema.Struct({
  account: Schema.String,
  ...AgentShareFundOperation.fields,
});
const StoredJournal = Schema.Struct({
  version: Schema.Literal(1),
  items: Schema.Array(StoredOperation).check(Schema.isMaxLength(64)),
});
type StoredJournal = typeof StoredJournal.Type;
const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(StoredJournal));
const encode = Schema.encodeEffect(Schema.fromJsonString(StoredJournal));
const decodeIntent = Schema.decodeEffect(AgentShareFundIntent);
const decodeReceipt = Schema.decodeEffect(AgentShareFundReceipt);
const fail = (category: "rejected" | "outcome-unknown" | "unavailable") =>
  new AgentShareAccountError({ operation: "funds-journal", category });

// This matches the platform's user-bound operation identity; device token rotation keeps recovery possible.
export function fundRequestId(
  identity: Pick<AccountIdentity, "userId">,
  intent: AgentShareFundIntent,
): string {
  return `${intent.action === "topup" ? "topup" : "withdraw"}_${Hex.encode(
    sha256(new TextEncoder().encode(`${identity.userId}\0${intent.key}`)).slice(0, 16),
  )}`;
}

function accountKey(identity: AccountIdentity): string {
  return `${identity.consoleUrl.replace(/\/$/, "")}\0${identity.userId}`;
}

function sameIntent(left: AgentShareFundIntent, right: AgentShareFundIntent): boolean {
  return (
    left.action === right.action &&
    left.key === right.key &&
    left.currency === right.currency &&
    left.amount_minor === right.amount_minor
  );
}

export class FundsJournal extends Context.Service<
  FundsJournal,
  {
    readonly read: (
      identity: AccountIdentity,
    ) => Effect.Effect<AgentShareFundOperation | null, AgentShareAccountError>;
    readonly prepare: (
      identity: AccountIdentity,
      intent: AgentShareFundIntent,
    ) => Effect.Effect<AgentShareFundOperation, AgentShareAccountError>;
    readonly submit: (
      identity: AccountIdentity,
      key: string,
      retry: boolean,
    ) => Effect.Effect<AgentShareFundOperation, AgentShareAccountError>;
    readonly confirm: (
      identity: AccountIdentity,
      key: string,
      receipt: AgentShareFundReceipt,
    ) => Effect.Effect<AgentShareFundOperation, AgentShareAccountError>;
    readonly reject: (
      identity: AccountIdentity,
      key: string,
    ) => Effect.Effect<void, AgentShareAccountError>;
    readonly cancel: (
      identity: AccountIdentity,
      key: string,
    ) => Effect.Effect<void, AgentShareAccountError>;
  }
>()("@agentshare/account-client/FundsJournal") {}

const make = Effect.gen(function* () {
  const storage = yield* FundsJournalStorage;
  const lock = yield* Semaphore.make(1);
  const load = Effect.fn("FundsJournal.load")(function* () {
    const raw = yield* storage.load();
    if (raw === null) return { data: { version: 1 as const, items: [] }, raw };
    if (raw.length > 128 * 1024) return yield* fail("unavailable");
    const journal = yield* decode(raw).pipe(Effect.mapError(() => fail("unavailable")));
    if (new Set(journal.items.map((item) => item.account)).size !== journal.items.length)
      return yield* fail("unavailable");
    for (const item of journal.items) {
      if (item.submitted_at && !Number.isFinite(Date.parse(item.submitted_at)))
        return yield* fail("unavailable");
      if ((item.state === "confirmed") !== (item.receipt !== undefined))
        return yield* fail("unavailable");
      if (item.receipt) {
        const parts = item.account.split("\0");
        if (
          parts.length !== 2 ||
          !parts[1] ||
          item.receipt.id !== fundRequestId({ userId: parts[1] }, item.intent) ||
          item.receipt.currency !== item.intent.currency ||
          item.receipt.amount_minor !== item.intent.amount_minor
        )
          return yield* fail("unavailable");
      }
    }
    return { data: journal, raw };
  });
  const save = Effect.fn("FundsJournal.save")((journal: StoredJournal, expected: string | null) =>
    encode(journal).pipe(
      Effect.mapError(() => fail("unavailable")),
      Effect.flatMap((value) => storage.save(value, expected)),
    ),
  );
  const project = (operation: typeof StoredOperation.Type): AgentShareFundOperation => ({
    intent: operation.intent,
    state: operation.state,
    ...(operation.receipt ? { receipt: operation.receipt } : {}),
    ...(operation.submitted_at ? { submitted_at: operation.submitted_at } : {}),
  });
  const replace = (journal: StoredJournal, operation: typeof StoredOperation.Type) => ({
    version: 1 as const,
    items: [...journal.items.filter((item) => item.account !== operation.account), operation],
  });

  const read = Effect.fn("FundsJournal.read")(
    function* (identity: AccountIdentity) {
      const operation = (yield* load()).data.items.find(
        (item) => item.account === accountKey(identity),
      );
      return operation ? project(operation) : null;
    },
    (effect) => lock.withPermit(effect),
  );
  const prepare = Effect.fn("FundsJournal.prepare")(
    function* (identity: AccountIdentity, input: AgentShareFundIntent) {
      const intent = yield* decodeIntent(input).pipe(Effect.mapError(() => fail("rejected")));
      const account = accountKey(identity);
      const { data: journal, raw } = yield* load();
      const prior = journal.items.find((item) => item.account === account);
      if (prior?.intent.key === intent.key) {
        if (!sameIntent(prior.intent, intent)) return yield* fail("rejected");
        return project(prior);
      }
      if (prior && prior.state !== "confirmed") return yield* fail("outcome-unknown");
      if (!prior && journal.items.length >= 64) return yield* fail("unavailable");
      const operation = { account, intent, state: "prepared" as const };
      yield* save(replace(journal, operation), raw);
      return project(operation);
    },
    (effect) => lock.withPermit(effect),
  );
  const submit = Effect.fn("FundsJournal.submit")(
    function* (identity: AccountIdentity, key: string, retry: boolean) {
      const { data: journal, raw } = yield* load();
      const operation = journal.items.find((item) => item.account === accountKey(identity));
      if (!operation || operation.intent.key !== key) return yield* fail("rejected");
      if (operation.state === "confirmed") return project(operation);
      if (operation.state === "unconfirmed" && !retry) return yield* fail("outcome-unknown");
      // Persist uncertainty BEFORE sending: a crash or interruption can never turn into a fresh request.
      const submitted = {
        ...operation,
        state: "unconfirmed" as const,
        submitted_at: operation.submitted_at ?? DateTime.formatIso(yield* DateTime.now),
      };
      yield* save(replace(journal, submitted), raw);
      return project(submitted);
    },
    (effect) => lock.withPermit(effect),
  );
  const confirm = Effect.fn("FundsJournal.confirm")(
    function* (identity: AccountIdentity, key: string, input: AgentShareFundReceipt) {
      const receipt = yield* decodeReceipt(input).pipe(
        Effect.mapError(() => fail("outcome-unknown")),
      );
      const { data: journal, raw } = yield* load();
      const operation = journal.items.find((item) => item.account === accountKey(identity));
      if (!operation || operation.intent.key !== key) return yield* fail("rejected");
      if (
        operation.state === "prepared" ||
        receipt.id !== fundRequestId(identity, operation.intent) ||
        receipt.currency !== operation.intent.currency ||
        receipt.amount_minor !== operation.intent.amount_minor
      )
        return yield* fail("outcome-unknown");
      const confirmed = { ...operation, state: "confirmed" as const, receipt };
      yield* save(replace(journal, confirmed), raw);
      return project(confirmed);
    },
    (effect) => lock.withPermit(effect),
  );
  const cancel = Effect.fn("FundsJournal.cancel")(
    function* (identity: AccountIdentity, key: string) {
      const { data: journal, raw } = yield* load();
      const account = accountKey(identity);
      const operation = journal.items.find((item) => item.account === account);
      if (!operation || operation.intent.key !== key) return yield* fail("rejected");
      if (operation.state !== "prepared") return yield* fail("outcome-unknown");
      yield* save(
        { version: 1, items: journal.items.filter((item) => item.account !== account) },
        raw,
      );
    },
    (effect) => lock.withPermit(effect),
  );
  const reject = Effect.fn("FundsJournal.reject")(
    function* (identity: AccountIdentity, key: string) {
      const { data: journal, raw } = yield* load();
      const operation = journal.items.find((item) => item.account === accountKey(identity));
      if (!operation || operation.intent.key !== key || operation.state !== "unconfirmed")
        return yield* fail("rejected");
      yield* save(
        replace(journal, {
          account: operation.account,
          intent: operation.intent,
          state: "prepared",
        }),
        raw,
      );
    },
    (effect) => lock.withPermit(effect),
  );
  return FundsJournal.of({ read, prepare, submit, confirm, cancel, reject });
});

export const layer = Layer.effect(FundsJournal, make);
