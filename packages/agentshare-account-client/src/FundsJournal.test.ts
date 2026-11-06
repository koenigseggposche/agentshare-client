import { assert, describe, it } from "@effect/vitest";
import { AgentShareAccountError, type AgentShareFundIntent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { AccountIdentity } from "./AccountConnection.ts";
import * as FundsJournal from "./FundsJournal.ts";

const identity: AccountIdentity = {
  owner: "account:generated",
  userId: "e8965f5f-afab-567b-aaef-fd214ef148fe",
  deviceId: "generated-device",
  consoleUrl: "https://console.example.invalid/console",
};
const intent: AgentShareFundIntent = {
  action: "topup",
  key: "10000000-0000-4000-8000-000000000001",
  currency: "USD",
  amount_minor: 1234,
};
const receipt = {
  id: FundsJournal.fundRequestId(identity, intent),
  currency: "USD",
  amount_minor: 1234,
  status: "pending",
};
const fixture = () => {
  let value: string | null = null;
  let failWrites = false;
  let writes = 0;
  const storage = Layer.succeed(FundsJournal.FundsJournalStorage, {
    load: () => Effect.sync(() => value),
    save: (next, expected) =>
      Effect.suspend(() => {
        if (failWrites || expected !== value)
          return Effect.fail(
            new AgentShareAccountError({ operation: "fixture", category: "unavailable" }),
          );
        value = next;
        writes++;
        return Effect.void;
      }),
  });
  const restart = () =>
    FundsJournal.FundsJournal.pipe(Effect.provide(FundsJournal.layer.pipe(Layer.provide(storage))));
  return {
    restart,
    raw: () => value,
    corrupt: (raw: string) => {
      value = raw;
    },
    fail: () => {
      failWrites = true;
    },
    writes: () => writes,
  };
};

describe("durable fund intent journal", () => {
  it.effect(
    "recovers an interrupted submission after restart without preparing another payment",
    () =>
      Effect.gen(function* () {
        const f = fixture();
        const first = yield* f.restart();
        yield* first.prepare(identity, intent);
        yield* first.submit(identity, intent.key, false);
        const restarted = yield* f.restart();
        assert.deepEqual(yield* restarted.read(identity), {
          intent,
          state: "unconfirmed",
          submitted_at: "1970-01-01T00:00:00.000Z",
        });
        assert.equal(
          (yield* restarted.submit(identity, intent.key, false).pipe(Effect.flip)).category,
          "outcome-unknown",
        );
        assert.equal(
          (yield* restarted
            .prepare(identity, { ...intent, key: "10000000-0000-4000-8000-000000000002" })
            .pipe(Effect.flip)).category,
          "outcome-unknown",
        );
        assert.equal(f.writes(), 2);
        assert.deepEqual((yield* restarted.submit(identity, intent.key, true)).intent, intent);
      }),
  );
  it.effect(
    "isolates accounts and services while allowing the same account to recover after device rotation",
    () =>
      Effect.gen(function* () {
        const f = fixture();
        const journal = yield* f.restart();
        yield* journal.prepare(identity, intent);
        assert.isNull(
          yield* journal.read({ ...identity, userId: "f8965f5f-afab-567b-aaef-fd214ef148fe" }),
        );
        assert.isNull(
          yield* journal.read({ ...identity, consoleUrl: "https://other.example.invalid/console" }),
        );
        assert.deepEqual(
          yield* journal.read({ ...identity, deviceId: "new-device", owner: "new-owner" }),
          { intent, state: "prepared" },
        );
      }),
  );
  it.effect(
    "rejects changed amounts and rejects cancellation after a submission may have reached the platform",
    () =>
      Effect.gen(function* () {
        const journal = yield* fixture().restart();
        yield* journal.prepare(identity, intent);
        assert.equal(
          (yield* journal.prepare(identity, { ...intent, amount_minor: 999 }).pipe(Effect.flip))
            .category,
          "rejected",
        );
        yield* journal.cancel(identity, intent.key);
        assert.isNull(yield* journal.read(identity));
        yield* journal.prepare(identity, intent);
        yield* journal.submit(identity, intent.key, false);
        assert.equal(
          (yield* journal.cancel(identity, intent.key).pipe(Effect.flip)).category,
          "outcome-unknown",
        );
      }),
  );
  it.effect(
    "only acknowledges the exact platform receipt and does not resubmit a confirmed intent",
    () =>
      Effect.gen(function* () {
        const f = fixture();
        const journal = yield* f.restart();
        yield* journal.prepare(identity, intent);
        yield* journal.submit(identity, intent.key, false);
        for (const wrong of [
          { ...receipt, amount_minor: 999 },
          { ...receipt, currency: "EUR" },
          { ...receipt, id: "topup_" + "f".repeat(32) },
        ]) {
          assert.equal(
            (yield* journal.confirm(identity, intent.key, wrong).pipe(Effect.flip)).category,
            "outcome-unknown",
          );
        }
        const confirmed = yield* journal.confirm(identity, intent.key, receipt);
        const count = f.writes();
        const restarted = yield* f.restart();
        assert.deepEqual(yield* restarted.submit(identity, intent.key, true), confirmed);
        assert.equal(f.writes(), count);
        assert.notInclude(f.raw()!, "checkout_url");
        yield* restarted.prepare(identity, {
          ...intent,
          key: "10000000-0000-4000-8000-000000000002",
        });
      }),
  );
  it.effect("does not authorize sending when durable storage fails", () =>
    Effect.gen(function* () {
      const f = fixture();
      const journal = yield* f.restart();
      yield* journal.prepare(identity, intent);
      f.fail();
      assert.equal(
        (yield* journal.submit(identity, intent.key, false).pipe(Effect.flip)).category,
        "unavailable",
      );
      assert.equal((yield* journal.read(identity))?.state, "prepared");
    }),
  );
  it.effect.each([
    "invalid json",
    JSON.stringify({ version: 1, items: [{ account: "x", intent, state: "confirmed" }] }),
  ])("keeps a corrupt journal intact and refuses payment preparation", (raw) =>
    Effect.gen(function* () {
      const f = fixture();
      f.corrupt(raw);
      const journal = yield* f.restart();
      assert.equal(
        (yield* journal.prepare(identity, intent).pipe(Effect.flip)).category,
        "unavailable",
      );
      assert.equal(f.raw(), raw);
      assert.equal(f.writes(), 0);
    }),
  );
});
