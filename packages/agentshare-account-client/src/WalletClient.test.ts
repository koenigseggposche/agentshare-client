import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/http";
import { AccountConnection, type AccountIdentity } from "./AccountConnection.ts";
import * as WalletClient from "./WalletClient.ts";

const owner: AccountIdentity = {
  owner: "account:generated",
  userId: "e8965f5f-afab-567b-aaef-fd214ef148fe",
  deviceId: "generated-device",
  consoleUrl: "https://console.example.invalid/console",
};
const overview = {
  currency: "USD",
  wallets: [
    {
      currency: "USD",
      available_micros: 1234567,
      held_micros: 0,
      pending_earnings_micros: 20,
      available_earnings_micros: 30,
      withdrawal_held_micros: 0,
    },
  ],
  summary: { spent_micros: 100, earned_micros: 50, requests: 1 },
  spending: [],
  earnings: [],
  topups: [],
  withdrawals: [],
  operator_credits: [],
  history_cursors: {
    spending: "",
    earnings: "",
    topups: "",
    withdrawals: "",
    operator_credits: "",
  },
  checkout_enabled: false,
  payouts_enabled: false,
  payment_preference: { currency: "USD", earnings_first: false, version: 0 },
};

const fixture = Effect.fn("WalletClient.test.fixture")(function* (options?: {
  readonly wrongAccount?: boolean;
  readonly changeAccountDuringRead?: boolean;
  readonly rejectOverview?: boolean;
  readonly rejectPreference?: boolean;
  readonly changeAccountDuringWrite?: boolean;
  readonly rejectRevocation?: boolean;
  readonly foreignDevice?: boolean;
}) {
  let current = owner;
  let tickets = 0;
  const requests: Array<{ path: string; cookie: string }> = [];
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      const path = new URL(request.url).pathname;
      const cookie = request.headers.cookie ?? "";
      requests.push({ path, cookie });
      let status = 200;
      let body: unknown = {};
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (path.endsWith("/v1/me")) {
        if (!cookie && !options?.wrongAccount) status = 401;
        else
          body = {
            user_id: options?.wrongAccount ? "f8965f5f-afab-567b-aaef-fd214ef148fe" : owner.userId,
            csrf: "b".repeat(64),
          };
      } else if (path.endsWith("/auth/device-login")) {
        assert.equal(request.headers.origin, "https://console.example.invalid");
        assert.equal(request.method, "POST");
        headers["set-cookie"] =
          "__Host-example=generated-session-secret; Secure; HttpOnly; Path=/; SameSite=Lax";
      } else if (path.endsWith("/v1/market/overview")) {
        if (options?.changeAccountDuringRead) current = { ...owner, owner: "account:other" };
        if (options?.rejectOverview) status = 503;
        body = {
          ...overview,
          devices: [
            {
              id: "generated-remote-device",
              name: "Generated desktop",
              created_at: "2026-11-01T00:00:00Z",
              consumer_id: "generated-private-consumer",
            },
          ],
          csrf: "generated-private-value",
          checkout_url: "https://private.example.invalid",
        };
      } else if (path.endsWith("/v1/market/payment-preference")) {
        assert.equal(request.headers["x-csrf-token"], "b".repeat(64));
        assert.equal(request.method, "POST");
        assert.include(cookie, "generated-session-secret");
        body = { currency: "USD", earnings_first: true, version: 1 };
        if (options?.rejectPreference) status = 503;
        if (options?.changeAccountDuringWrite) current = { ...owner, owner: "account:other" };
      } else if (path.endsWith("/v1/market/devices/generated-remote-device")) {
        assert.equal(request.method, "DELETE");
        assert.equal(request.headers["x-csrf-token"], "b".repeat(64));
        assert.include(cookie, "generated-session-secret");
        body = { ok: true };
        if (options?.rejectRevocation) status = 503;
        if (options?.foreignDevice) status = 404;
        if (options?.changeAccountDuringWrite) current = { ...owner, owner: "account:other" };
      } else throw new Error("unexpected account route");
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), { status, headers }),
      );
    }),
  );
  const client = yield* WalletClient.WalletClient.pipe(
    Effect.provide(
      WalletClient.layer.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
        Layer.provide(
          Layer.succeed(AccountConnection, {
            identity: () => Effect.sync(() => current),
            sessionTicket: () =>
              Effect.sync(() => {
                tickets++;
                return "a".repeat(64);
              }),
          }),
        ),
      ),
    ),
  );
  return { client, requests, tickets: () => tickets };
});

describe("account wallet", () => {
  it.effect(
    "returns the account’s device list and trusted current device without consumer credentials",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const result = yield* f.client.read({ action: "devices", owner: owner.owner });
        assert.equal(result.action, "devices");
        if (result.action !== "devices") return assert.fail("expected device list");
        assert.equal(result.data.current_device_id, owner.deviceId);
        assert.equal(result.data.devices[0]?.name, "Generated desktop");
        assert.notInclude(JSON.stringify(result), "generated-private");
      }),
  );
  it.effect("revokes another device with private cookie and CSRF", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const result = yield* f.client.command({
        action: "revokeDevice",
        owner: owner.owner,
        device_id: "generated-remote-device",
      });
      assert.deepEqual(result, {
        action: "revokeDevice",
        owner: owner.owner,
        data: { device_id: "generated-remote-device", ok: true },
      });
      assert.equal(
        f.requests.filter((request) => request.path.includes("/market/devices/")).length,
        1,
      );
    }),
  );
  it.effect.each([
    { rejectRevocation: true, category: "outcome-unknown" },
    { foreignDevice: true, category: "rejected" },
    { changeAccountDuringWrite: true, category: "account-changed" },
  ] as const)(
    "does not replay or acknowledge an unconfirmed device revocation ($category)",
    (options) =>
      Effect.gen(function* () {
        const f = yield* fixture(options);
        const error = yield* f.client
          .command({
            action: "revokeDevice",
            owner: owner.owner,
            device_id: "generated-remote-device",
          })
          .pipe(Effect.flip);
        assert.equal(error.category, options.category);
        assert.equal(
          f.requests.filter((request) => request.path.includes("/market/devices/")).length,
          1,
        );
      }),
  );
  it.effect("rejects current-device revocation and a stale owner without sending DELETE", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      for (const input of [
        {
          action: "revokeDevice" as const,
          owner: "account:other",
          device_id: "generated-remote-device",
        },
        { action: "revokeDevice" as const, owner: owner.owner, device_id: owner.deviceId },
      ]) {
        const error = yield* f.client.command(input).pipe(Effect.flip);
        assert.equal(error.category, input.owner === owner.owner ? "rejected" : "account-changed");
      }
      assert.equal(
        f.requests.filter((request) => request.path.includes("/market/devices/")).length,
        0,
      );
    }),
  );
  it.effect(
    "updates payment preference through the verified private session and its CSRF token",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const result = yield* f.client.command({
          action: "paymentPreference",
          owner: owner.owner,
          currency: "USD",
          earnings_first: true,
        });
        assert.deepEqual(result, {
          action: "paymentPreference",
          owner: owner.owner,
          data: { currency: "USD", earnings_first: true, version: 1 },
        });
        assert.equal(
          f.requests.filter((request) => request.path.endsWith("payment-preference")).length,
          1,
        );
      }),
  );
  it.effect.each([
    { rejectPreference: true, category: "outcome-unknown" },
    { changeAccountDuringWrite: true, category: "account-changed" },
  ] as const)(
    "does not replay or acknowledge an unconfirmed preference update ($category)",
    (options) =>
      Effect.gen(function* () {
        const f = yield* fixture(options);
        const error = yield* f.client
          .command({
            action: "paymentPreference",
            owner: owner.owner,
            currency: "USD",
            earnings_first: true,
          })
          .pipe(Effect.flip);
        assert.equal(error.category, options.category);
        assert.equal(
          f.requests.filter((request) => request.path.endsWith("payment-preference")).length,
          1,
        );
      }),
  );
  it.effect("uses an isolated ticket session and only returns typed account data", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const result = yield* f.client.read({ action: "overview", owner: owner.owner });
      assert.equal(result.action, "overview");
      assert.equal(f.tickets(), 1);
      assert.include(f.requests.at(-1)?.cookie ?? "", "generated-session-secret");
      assert.notInclude(JSON.stringify(result), "generated-private");
      assert.notInclude(JSON.stringify(result), "generated-session");
      assert.notInclude(JSON.stringify(result), "checkout_url");
      yield* f.client.read({ action: "overview", owner: owner.owner });
      assert.equal(f.tickets(), 1);
    }),
  );
  it.effect("rejects a stale owner before network access", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const error = yield* f.client
        .read({ action: "overview", owner: "account:other" })
        .pipe(Effect.flip);
      assert.equal(error.category, "account-changed");
      assert.equal(f.requests.length, 0);
      const commandError = yield* f.client
        .command({
          action: "paymentPreference",
          owner: "account:other",
          currency: "USD",
          earnings_first: true,
        })
        .pipe(Effect.flip);
      assert.equal(commandError.category, "account-changed");
      assert.equal(f.requests.length, 0);
    }),
  );
  it.effect("does not return data after the signed-in owner changes", () =>
    Effect.gen(function* () {
      const f = yield* fixture({ changeAccountDuringRead: true });
      const error = yield* f.client
        .read({ action: "overview", owner: owner.owner })
        .pipe(Effect.flip);
      assert.equal(error.category, "account-changed");
    }),
  );
  it.effect("refuses a browser session for a different account", () =>
    Effect.gen(function* () {
      const f = yield* fixture({ wrongAccount: true });
      const error = yield* f.client
        .read({ action: "overview", owner: owner.owner })
        .pipe(Effect.flip);
      assert.equal(error.category, "account-changed");
      assert.equal(f.requests.filter((r) => r.path.endsWith("/overview")).length, 0);
    }),
  );
  it.effect("does not replay a failed platform request", () =>
    Effect.gen(function* () {
      const f = yield* fixture({ rejectOverview: true });
      const error = yield* f.client
        .read({ action: "overview", owner: owner.owner })
        .pipe(Effect.flip);
      assert.equal(error.status, 503);
      assert.equal(f.requests.filter((r) => r.path.endsWith("/overview")).length, 1);
    }),
  );
});
