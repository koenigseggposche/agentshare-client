import { assert, describe, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";
import { DeviceCredentials, DeviceLoginConfig } from "./DeviceCredentials.ts";
import * as DeviceLogin from "./DeviceLogin.ts";

const token = "generated-device-credential-".repeat(5);
const userId = "e8965f5f-afab-567b-aaef-fd214ef148fe";
const fixture = Effect.fn("DeviceLogin.test.fixture")(function* (options?: {
  readonly wrongVerificationOrigin?: boolean;
  readonly disconnectFailure?: boolean;
}) {
  let stored: string | null = null;
  let approved = false;
  let revoked = false;
  let redemptions = 0;
  const now = yield* Clock.currentTimeMillis;
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      const path = new URL(request.url).pathname;
      assert.isUndefined(request.headers.origin);
      let status = 200;
      let body: unknown = {};
      if (path.endsWith("/start"))
        body = {
          device_code: "a".repeat(64),
          user_code: "ABCDEF12",
          interval: 2,
          expires_at: DateTime.formatIso(DateTime.makeUnsafe(now + 600_000)),
          verification_uri: options?.wrongVerificationOrigin
            ? "https://other.invalid/console/?pair=ABCDEF12"
            : "https://console.example.invalid/console/?pair=ABCDEF12",
        };
      else if (path.endsWith("/redeem")) {
        redemptions++;
        if (!approved) status = 428;
        else
          body = {
            device: { id: "device_generated" },
            device_token: token,
            consumer_token: "unused-consumer-secret",
          };
      } else {
        assert.equal(request.headers.authorization, `Bearer ${token}`);
        if (path.endsWith("/profile")) {
          assert.isNotNull(stored);
          if (revoked) status = 401;
          else body = { device: { id: "device_generated" }, user_id: userId };
        } else if (path.endsWith("/disconnect")) status = options?.disconnectFailure ? 503 : 200;
        else if (path.endsWith("/console-session")) body = { ticket: "b".repeat(64) };
        else assert.fail(`Unexpected request ${path}`);
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  const service = yield* DeviceLogin.DeviceLogin.pipe(
    Effect.provide(
      DeviceLogin.layer.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
        Layer.provide(
          Layer.succeed(DeviceCredentials, {
            load: () => Effect.succeed(stored),
            save: (value) =>
              Effect.sync(() => {
                stored = value;
              }),
            clear: () =>
              Effect.sync(() => {
                stored = null;
              }),
          }),
        ),
        Layer.provide(
          Layer.succeed(DeviceLoginConfig, {
            consoleUrl: "https://console.example.invalid/console",
            deviceName: "Generated mobile device",
            verifier: () => Effect.succeed("c".repeat(64)),
          }),
        ),
      ),
    ),
  );
  return {
    service,
    stored: () => stored,
    redemptions: () => redemptions,
    approve: () => {
      approved = true;
    },
    revoke: () => {
      revoked = true;
    },
  };
});

describe("native device login", () => {
  it.effect(
    "keeps grant secrets private, honors polling intervals and persists redemption before profile lookup",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const started = yield* f.service.start();
        assert.equal(started.status, "pending");
        assert.notInclude(JSON.stringify(started), "device_code");
        assert.notInclude(JSON.stringify(started), "verifier");
        yield* f.service.check();
        assert.equal(f.redemptions(), 0);
        yield* TestClock.adjust("2 seconds");
        assert.equal((yield* f.service.check()).status, "pending");
        f.approve();
        yield* TestClock.adjust("2 seconds");
        const result = yield* f.service.check();
        assert.equal(result.status, "signed-in");
        assert.notInclude(JSON.stringify(result), token);
        assert.notInclude(f.stored()!, "unused-consumer-secret");
        yield* f.service.check();
        assert.equal(f.redemptions(), 2);
        const owner = `account:${userId}`;
        assert.equal(yield* f.service.sessionTicket(owner), "b".repeat(64));
        assert.equal(
          (yield* f.service.sessionTicket("account:other").pipe(Effect.flip)).category,
          "account-changed",
        );
      }),
  );
  it.effect(
    "cancels a pending grant and rejects verification URLs outside the configured Console",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.service.start();
        yield* f.service.cancel();
        yield* TestClock.adjust("2 seconds");
        assert.equal((yield* f.service.check()).status, "signed-out");
        assert.equal(f.redemptions(), 0);
        const wrong = yield* fixture({ wrongVerificationOrigin: true });
        assert.equal((yield* wrong.service.start().pipe(Effect.flip)).category, "invalid-response");
        assert.equal((yield* wrong.service.state()).status, "signed-out");
      }),
  );
  it.effect(
    "clears revoked credentials and keeps a failed remote sign-out visible after local removal",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture({ disconnectFailure: true });
        yield* f.service.start();
        f.approve();
        yield* TestClock.adjust("2 seconds");
        yield* f.service.check();
        assert.equal((yield* f.service.signOut().pipe(Effect.flip)).status, 503);
        assert.isNull(f.stored());
        assert.equal((yield* f.service.state()).status, "signed-out");
        yield* f.service.start();
        f.approve();
        yield* TestClock.adjust("2 seconds");
        yield* f.service.check();
        f.revoke();
        assert.equal((yield* f.service.identity().pipe(Effect.flip)).category, "sign-in-required");
        assert.isNull(f.stored());
        assert.equal((yield* f.service.state()).status, "signed-out");
      }),
  );
});
