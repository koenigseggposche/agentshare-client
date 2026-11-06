import { AgentShareAccountError } from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";

import { AccountConnection, type AccountIdentity } from "./AccountConnection.ts";
import { DeviceCredentials, DeviceLoginConfig } from "./DeviceCredentials.ts";

const Hex = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const DeviceId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,128}$/));
const Credential = Schema.Struct({
  consoleUrl: Schema.String,
  deviceId: DeviceId,
  token: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._~-]{80,4096}$/)),
});
const Grant = Schema.Struct({
  device_code: Hex,
  user_code: Schema.String.check(Schema.isPattern(/^[A-F0-9]{8}$/)),
  verification_uri: Schema.String,
  expires_at: Schema.String,
  interval: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 60 })),
});
const Enrollment = Schema.Struct({
  device: Schema.Struct({ id: DeviceId }),
  device_token: Credential.fields.token,
});
const Profile = Schema.Struct({
  user_id: Schema.String.check(Schema.isPattern(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)),
  device: Schema.Struct({ id: DeviceId }),
});
const Ticket = Schema.Struct({ ticket: Hex });
const decodeCredential = Schema.decodeUnknownEffect(Schema.fromJsonString(Credential));
const encodeCredential = Schema.encodeEffect(Schema.fromJsonString(Credential));
const decodeGrant = Schema.decodeUnknownEffect(Grant);
const decodeEnrollment = Schema.decodeUnknownEffect(Enrollment);
const decodeProfile = Schema.decodeUnknownEffect(Profile);
const decodeTicket = Schema.decodeUnknownEffect(Ticket);
const isAccountError = Schema.is(AgentShareAccountError);

export type DeviceLoginState =
  | { readonly status: "signed-out"; readonly consoleUrl: string }
  | {
      readonly status: "pending";
      readonly consoleUrl: string;
      readonly userCode: string;
      readonly verificationUrl: string;
      readonly expiresAt: string;
      readonly interval: number;
    }
  | {
      readonly status: "signed-in";
      readonly consoleUrl: string;
      readonly identity: AccountIdentity;
    };

export class DeviceLogin extends Context.Service<
  DeviceLogin,
  {
    readonly state: () => Effect.Effect<DeviceLoginState, AgentShareAccountError>;
    readonly start: () => Effect.Effect<DeviceLoginState, AgentShareAccountError>;
    readonly check: () => Effect.Effect<DeviceLoginState, AgentShareAccountError>;
    readonly cancel: () => Effect.Effect<void>;
    readonly signOut: () => Effect.Effect<void, AgentShareAccountError>;
    readonly identity: () => Effect.Effect<AccountIdentity, AgentShareAccountError>;
    readonly sessionTicket: (owner: string) => Effect.Effect<string, AgentShareAccountError>;
  }
>()("@agentshare/account-client/DeviceLogin") {}

function consoleUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[A-Za-z0-9_/-]*$/.test(url.pathname)
    )
      return undefined;
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

const make = Effect.gen(function* () {
  const config = yield* DeviceLoginConfig;
  const store = yield* DeviceCredentials;
  const http = yield* HttpClient.HttpClient;
  const lock = yield* Semaphore.make(1);
  const base = consoleUrl(config.consoleUrl);
  let pending: { grant: typeof Grant.Type; verifier: string; nextPoll: number } | undefined;

  const request = Effect.fn("DeviceLogin.request")(function* (
    route: string,
    body?: Schema.Json,
    token?: string,
  ) {
    if (!base)
      return yield* new AgentShareAccountError({ operation: "login", category: "rejected" });
    let input = HttpClientRequest.make(body === undefined ? "GET" : "POST")(base + route).pipe(
      HttpClientRequest.setHeader("Accept", "application/json"),
      HttpClientRequest.setHeader("Cache-Control", "no-store"),
    );
    if (token) input = input.pipe(HttpClientRequest.bearerToken(token));
    if (body !== undefined) input = input.pipe(HttpClientRequest.bodyJsonUnsafe(body));
    return yield* http.execute(input).pipe(
      Effect.flatMap((response) =>
        response.status < 200 || response.status >= 300
          ? Effect.fail(
              new AgentShareAccountError({
                operation: "login",
                category: response.status === 401 ? "sign-in-required" : "rejected",
                status: response.status,
              }),
            )
          : response.json.pipe(
              Effect.mapError(
                (cause) =>
                  new AgentShareAccountError({
                    operation: "login",
                    category: "invalid-response",
                    cause,
                  }),
              ),
            ),
      ),
      Effect.timeout("15 seconds"),
      Effect.mapError((cause) =>
        isAccountError(cause)
          ? cause
          : new AgentShareAccountError({
              operation: "login",
              category: body === undefined ? "unavailable" : "outcome-unknown",
              cause,
            }),
      ),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "manual",
        credentials: "omit",
      }),
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(2 * 1024 * 1024)),
    );
  });
  const credential = Effect.fn("DeviceLogin.credential")(function* () {
    const raw = yield* store.load();
    if (raw === null) return null;
    const value = yield* decodeCredential(raw).pipe(
      Effect.mapError(
        (cause) =>
          new AgentShareAccountError({
            operation: "credentials",
            category: "invalid-response",
            cause,
          }),
      ),
    );
    if (value.consoleUrl !== base)
      return yield* new AgentShareAccountError({
        operation: "credentials",
        category: "account-changed",
      });
    return value;
  });
  const profile = Effect.fn("DeviceLogin.profile")(function* (value: typeof Credential.Type) {
    const data = yield* request("/v1/device/profile", undefined, value.token).pipe(
      Effect.flatMap(decodeProfile),
      Effect.tapError((error) =>
        isAccountError(error) && error.status === 401 ? store.clear() : Effect.void,
      ),
      Effect.mapError((cause) =>
        isAccountError(cause)
          ? cause
          : new AgentShareAccountError({
              operation: "profile",
              category: "invalid-response",
              cause,
            }),
      ),
    );
    if (data.device.id !== value.deviceId)
      return yield* new AgentShareAccountError({
        operation: "profile",
        category: "account-changed",
      });
    return {
      owner: `account:${data.user_id}`,
      userId: data.user_id,
      deviceId: value.deviceId,
      consoleUrl: value.consoleUrl,
    };
  });
  const identity = Effect.fn("DeviceLogin.identity")(
    function* () {
      const value = yield* credential();
      if (!value)
        return yield* new AgentShareAccountError({
          operation: "identity",
          category: "sign-in-required",
        });
      return yield* profile(value);
    },
    (effect) => lock.withPermit(effect),
  );
  const state = Effect.fn("DeviceLogin.state")(function* (): Effect.fn.Return<
    DeviceLoginState,
    AgentShareAccountError
  > {
    const value = yield* credential();
    if (value)
      return { status: "signed-in", consoleUrl: base ?? "", identity: yield* profile(value) };
    if (pending && Date.parse(pending.grant.expires_at) <= (yield* Clock.currentTimeMillis))
      pending = undefined;
    return pending
      ? {
          status: "pending",
          consoleUrl: base ?? "",
          userCode: pending.grant.user_code,
          verificationUrl: pending.grant.verification_uri,
          expiresAt: pending.grant.expires_at,
          interval: pending.grant.interval,
        }
      : { status: "signed-out", consoleUrl: base ?? "" };
  });
  const start = Effect.fn("DeviceLogin.start")(
    function* () {
      if (!base)
        return yield* new AgentShareAccountError({ operation: "login", category: "rejected" });
      if (yield* credential()) return yield* state();
      if (pending && Date.parse(pending.grant.expires_at) > (yield* Clock.currentTimeMillis))
        return yield* state();
      const verifier = yield* config.verifier();
      if (!/^[a-f0-9]{64}$/.test(verifier))
        return yield* new AgentShareAccountError({
          operation: "login",
          category: "invalid-response",
        });
      const grant = yield* request("/v1/device/start", { name: config.deviceName, verifier }).pipe(
        Effect.flatMap(decodeGrant),
        Effect.mapError((cause) =>
          isAccountError(cause)
            ? cause
            : new AgentShareAccountError({
                operation: "login",
                category: "invalid-response",
                cause,
              }),
        ),
      );
      const now = yield* Clock.currentTimeMillis;
      const expires = Date.parse(grant.expires_at);
      const expected = new URL(base + "/");
      expected.searchParams.set("pair", grant.user_code);
      if (
        !Number.isFinite(expires) ||
        expires <= now ||
        expires > now + 11 * 60_000 ||
        grant.verification_uri !== expected.href
      )
        return yield* new AgentShareAccountError({
          operation: "login",
          category: "invalid-response",
        });
      pending = { grant, verifier, nextPoll: now + grant.interval * 1000 };
      return yield* state();
    },
    (effect) => lock.withPermit(effect),
  );
  const check = Effect.fn("DeviceLogin.check")(
    function* () {
      const current = yield* state();
      if (current.status !== "pending" || !pending) return current;
      const now = yield* Clock.currentTimeMillis;
      if (now < pending.nextPoll) return current;
      pending.nextPoll = now + pending.grant.interval * 1000;
      const result = yield* request("/v1/device/redeem", {
        device_code: pending.grant.device_code,
        verifier: pending.verifier,
      }).pipe(
        Effect.catchTags({
          AgentShareAccountError: (error) => {
            if (error.status === 428) return Effect.succeed(null);
            if (
              error.status === 400 ||
              error.status === 410 ||
              error.category === "outcome-unknown"
            )
              pending = undefined;
            return Effect.fail(error);
          },
        }),
      );
      if (result === null) return current;
      // Redemption consumes the grant; persist before further network work, and never replay it.
      pending = undefined;
      const enrolled = yield* decodeEnrollment(result).pipe(
        Effect.mapError(
          (cause) =>
            new AgentShareAccountError({ operation: "login", category: "invalid-response", cause }),
        ),
      );
      const saved = yield* encodeCredential({
        consoleUrl: base ?? "",
        deviceId: enrolled.device.id,
        token: enrolled.device_token,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new AgentShareAccountError({
              operation: "credentials",
              category: "invalid-response",
              cause,
            }),
        ),
      );
      yield* store.save(saved);
      return yield* state();
    },
    (effect) => lock.withPermit(effect),
  );
  const cancel = Effect.fn("DeviceLogin.cancel")(
    () =>
      Effect.sync(() => {
        pending = undefined;
      }),
    (effect) => lock.withPermit(effect),
  );
  const signOut = Effect.fn("DeviceLogin.signOut")(
    function* () {
      pending = undefined;
      const value = yield* credential().pipe(Effect.tapError(() => store.clear()));
      if (!value) return;
      const failure = yield* request("/v1/device/disconnect", {}, value.token).pipe(
        Effect.catchTags({
          AgentShareAccountError: (error) =>
            error.status === 401 ? Effect.void : Effect.fail(error),
        }),
        Effect.as(null),
        Effect.catch((error) => Effect.succeed(error)),
      );
      yield* store.clear();
      if (failure) return yield* failure;
    },
    (effect) => lock.withPermit(effect),
  );
  const sessionTicket = Effect.fn("DeviceLogin.sessionTicket")(
    function* (owner: string) {
      const value = yield* credential();
      if (!value)
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "sign-in-required",
        });
      if ((yield* profile(value)).owner !== owner)
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "account-changed",
        });
      return (yield* request("/v1/device/console-session", {}, value.token).pipe(
        Effect.flatMap(decodeTicket),
        Effect.mapError((cause) =>
          isAccountError(cause)
            ? cause
            : new AgentShareAccountError({
                operation: "session",
                category: "invalid-response",
                cause,
              }),
        ),
      )).ticket;
    },
    (effect) => lock.withPermit(effect),
  );
  const readState = Effect.fn("DeviceLogin.readState")(
    () => state(),
    (effect) => lock.withPermit(effect),
  );
  return DeviceLogin.of({
    state: readState,
    start,
    check,
    cancel,
    signOut,
    identity,
    sessionTicket,
  });
});

export const layer = Layer.effect(DeviceLogin, make);
export const layerAccountConnection = Layer.effect(
  AccountConnection,
  Effect.gen(function* () {
    const login = yield* DeviceLogin;
    return AccountConnection.of({ identity: login.identity, sessionTicket: login.sessionTicket });
  }),
);
