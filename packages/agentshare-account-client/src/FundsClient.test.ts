import { assert, describe, it } from "@effect/vitest";
import { AgentShareAccountError, type AgentShareFundIntent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import { AccountConnection, type AccountIdentity } from "./AccountConnection.ts";
import * as FundsClient from "./FundsClient.ts";
import * as FundsJournal from "./FundsJournal.ts";
import * as WalletClient from "./WalletClient.ts";

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
const owner = identity.owner;
const fixture = (selected: AgentShareFundIntent = intent) => {
  let value: string | null = null;
  let current = identity;
  let status = 201;
  let missing = false;
  let malformed = false;
  let badLink = false;
  let failStorage = false;
  let changedDuringMe = false;
  let calls = 0;
  const keys: string[] = [];
  const receipt = {
    id: FundsJournal.fundRequestId(identity, selected),
    currency: "USD",
    amount_minor: 1234,
    status: selected.action === "topup" ? "pending" : "processing",
    created_at: "1970-01-01T00:00:00.000Z",
  };
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      const path = new URL(request.url).pathname;
      const cookie = request.headers.cookie ?? "";
      let responseStatus = 200;
      let body: unknown = {};
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (path.endsWith("/v1/me")) {
        if (!cookie) responseStatus = 401;
        else body = { user_id: identity.userId, csrf: "b".repeat(64) };
        if (cookie && changedDuringMe) current = { ...identity, owner: "account:other" };
      } else if (path.endsWith("/auth/device-login")) {
        headers["set-cookie"] =
          "__Host-example=generated-session-secret; Secure; HttpOnly; Path=/; SameSite=Lax";
      } else {
        assert.include(cookie, "generated-session-secret");
        assert.equal(request.headers.origin, "https://console.example.invalid");
        if (request.method === "POST") {
          assert.equal(request.headers["x-csrf-token"], "b".repeat(64));
          calls++;
          keys.push(request.headers["idempotency-key"] ?? "");
          if (!path.endsWith("/retry")) {
            assert.equal(request.headers["idempotency-key"], selected.key);
            assert.include(["unconfirmed", "confirmed"], JSON.parse(value!).items[0].state);
          }
          responseStatus = status;
          body =
            selected.action === "topup"
              ? {
                  ...receipt,
                  amount_minor: malformed ? 999 : 1234,
                  checkout_url: badLink
                    ? "https://checkout.stripe.com.evil.invalid/session"
                    : "https://checkout.stripe.com/c/generated",
                }
              : status === 202
                ? { withdrawal: receipt, error: "transfer_confirmation_pending", retry_after: 30 }
                : {
                    ...receipt,
                    status: "transferred",
                    destination: "generated-private-destination",
                  };
        } else if (path.endsWith("/v1/market/history")) {
          body = {
            items: missing
              ? []
              : [
                  {
                    ...receipt,
                    processor_session: "generated-private-session",
                    destination: "generated-private-destination",
                  },
                ],
            next_cursor: "",
          };
        } else throw new Error("Unexpected route");
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), { status: responseStatus, headers }),
      );
    }),
  );
  const storage = Layer.succeed(FundsJournal.FundsJournalStorage, {
    load: () => Effect.sync(() => value),
    save: (next, expected) =>
      Effect.suspend(() => {
        if (failStorage || expected !== value)
          return Effect.fail(
            new AgentShareAccountError({ operation: "storage", category: "unavailable" }),
          );
        value = next;
        return Effect.void;
      }),
  });
  const restart = () =>
    FundsClient.FundsClient.pipe(
      Effect.provide(
        FundsClient.layer.pipe(
          Layer.provide(WalletClient.layer),
          Layer.provide(FundsJournal.layer),
          Layer.provide(storage),
          Layer.provide(
            Layer.succeed(AccountConnection, {
              identity: () => Effect.sync(() => current),
              sessionTicket: () => Effect.succeed("a".repeat(64)),
            }),
          ),
          Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
        ),
      ),
    );
  return {
    restart,
    raw: () => value,
    calls: () => calls,
    keys,
    status: (next: number) => {
      status = next;
    },
    missing: () => {
      missing = true;
    },
    malformed: () => {
      malformed = true;
    },
    badLink: () => {
      badLink = true;
    },
    failStorage: () => {
      failStorage = true;
    },
    changeAccount: () => {
      changedDuringMe = true;
    },
  };
};

describe("account fund operations", () => {
  it.effect(
    "persists before HTTP and recovers a lost response without another payment or leaking processor state",
    () =>
      Effect.gen(function* () {
        const f = fixture();
        const client = yield* f.restart();
        yield* client.command({ owner, action: "prepare", intent });
        f.status(502);
        assert.equal(
          (yield* client
            .command({ owner, action: "submit", key: intent.key, retry: false })
            .pipe(Effect.flip)).category,
          "outcome-unknown",
        );
        assert.equal(JSON.parse(f.raw()!).items[0].state, "unconfirmed");
        const restarted = yield* f.restart();
        assert.equal(
          (yield* restarted
            .command({ owner, action: "submit", key: intent.key, retry: false })
            .pipe(Effect.flip)).category,
          "outcome-unknown",
        );
        const result = yield* restarted.read({ owner, action: "reconcile" });
        assert.equal(result.operation?.state, "confirmed");
        assert.notInclude(JSON.stringify(result), "generated-private");
        assert.notInclude(f.raw()!, "checkout");
        yield* restarted.command({ owner, action: "submit", key: intent.key, retry: true });
        assert.equal(f.calls(), 1);
      }),
  );
  it.effect("only explicitly retries the original key within its recorded window", () =>
    Effect.gen(function* () {
      const f = fixture();
      const client = yield* f.restart();
      yield* client.command({ owner, action: "prepare", intent });
      f.status(502);
      yield* client
        .command({ owner, action: "submit", key: intent.key, retry: false })
        .pipe(Effect.flip);
      f.missing();
      assert.equal(
        (yield* client.read({ owner, action: "reconcile" }).pipe(Effect.flip)).category,
        "outcome-unknown",
      );
      f.status(403);
      yield* client
        .command({ owner, action: "submit", key: intent.key, retry: true })
        .pipe(Effect.flip);
      assert.equal((yield* client.read({ owner, action: "read" })).operation?.state, "unconfirmed");
      f.status(201);
      const done = yield* client.command({ owner, action: "submit", key: intent.key, retry: true });
      assert.equal(done.handoff_url, "https://checkout.stripe.com/c/generated");
      assert.deepEqual(f.keys, [intent.key, intent.key, intent.key]);
      const reopened = yield* client.command({ owner, action: "resumeCheckout", key: intent.key });
      assert.equal(reopened.handoff_url, done.handoff_url);
      assert.notInclude(f.raw()!, "checkout_url");
      yield* TestClock.adjust("24 hours");
      assert.equal(
        (yield* client
          .command({ owner, action: "resumeCheckout", key: intent.key })
          .pipe(Effect.flip)).category,
        "outcome-unknown",
      );
      assert.equal(f.calls(), 4);
    }),
  );
  it.effect("refuses stale unknown retries and keeps a not-found receipt unresolved", () =>
    Effect.gen(function* () {
      const f = fixture();
      const client = yield* f.restart();
      yield* client.command({ owner, action: "prepare", intent });
      f.status(502);
      yield* client
        .command({ owner, action: "submit", key: intent.key, retry: false })
        .pipe(Effect.flip);
      yield* TestClock.adjust("24 hours");
      assert.equal(
        (yield* client
          .command({ owner, action: "submit", key: intent.key, retry: true })
          .pipe(Effect.flip)).category,
        "outcome-unknown",
      );
      assert.equal(f.calls(), 1);
    }),
  );
  it.effect("refuses wrong receipts and untrusted checkout hosts while preserving recovery", () =>
    Effect.gen(function* () {
      for (const mode of ["receipt", "link"] as const) {
        const f = fixture();
        const client = yield* f.restart();
        yield* client.command({ owner, action: "prepare", intent });
        if (mode === "receipt") f.malformed();
        else f.badLink();
        const error = yield* client
          .command({ owner, action: "submit", key: intent.key, retry: false })
          .pipe(Effect.flip);
        assert.equal(error.category, mode === "receipt" ? "outcome-unknown" : "invalid-response");
        assert.notInclude(f.raw()!, "evil.invalid");
        assert.equal(f.calls(), 1);
      }
    }),
  );
  it.effect(
    "blocks sends when durable storage fails or the account changes during session validation",
    () =>
      Effect.gen(function* () {
        for (const mode of ["storage", "account"] as const) {
          const f = fixture();
          const client = yield* f.restart();
          yield* client.command({ owner, action: "prepare", intent });
          if (mode === "storage") f.failStorage();
          else f.changeAccount();
          const error = yield* client
            .command({ owner, action: "submit", key: intent.key, retry: false })
            .pipe(Effect.flip);
          assert.equal(error.category, mode === "storage" ? "unavailable" : "account-changed");
          assert.equal(f.calls(), 0);
        }
      }),
  );
  it.effect(
    "allows changing a definitively rejected amount but keeps transfer confirmation explicit",
    () =>
      Effect.gen(function* () {
        const withdrawal = { ...intent, action: "withdraw" as const };
        const f = fixture(withdrawal);
        const client = yield* f.restart();
        yield* client.command({ owner, action: "prepare", intent: withdrawal });
        f.status(402);
        yield* client
          .command({ owner, action: "submit", key: intent.key, retry: false })
          .pipe(Effect.flip);
        assert.equal((yield* client.read({ owner, action: "read" })).operation?.state, "prepared");
        yield* client.command({ owner, action: "cancel", key: intent.key });
        yield* client.command({ owner, action: "prepare", intent: withdrawal });
        f.status(202);
        const pending = yield* client.command({
          owner,
          action: "submit",
          key: intent.key,
          retry: false,
        });
        assert.equal(pending.operation?.receipt?.status, "processing");
        const calls = f.calls();
        yield* client.command({ owner, action: "submit", key: intent.key, retry: true });
        assert.equal(f.calls(), calls);
        f.status(201);
        const sent = yield* client.command({ owner, action: "retryWithdrawal", key: intent.key });
        assert.equal(sent.operation?.receipt?.status, "transferred");
        assert.notInclude(JSON.stringify(sent), "destination");
      }),
  );
});
