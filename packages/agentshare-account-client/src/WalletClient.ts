import {
  AgentShareAccountError,
  AgentShareWalletOverview,
  AgentShareWalletDetail,
  AgentShareWalletReadInput,
  AgentShareWalletCommandInput,
  AgentSharePaymentPreference,
  AgentShareAccountDevices,
  type AgentShareWalletCommandResult,
  type AgentShareWalletReadResult,
} from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";
import type * as Cookies from "effect/http/Cookies";

import { AccountConnection, type AccountIdentity } from "./AccountConnection.ts";

const Me = Schema.Struct({
  user_id: Schema.String,
  csrf: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
const History = Schema.Struct({
  items: AgentShareWalletOverview.fields.spending,
  next_cursor: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{0,512}$/))),
});
const isAccountError = Schema.is(AgentShareAccountError);
const decodeReadInput = Schema.decodeEffect(AgentShareWalletReadInput);
const decodeOverview = Schema.decodeUnknownEffect(AgentShareWalletOverview);
const decodeCommandInput = Schema.decodeEffect(AgentShareWalletCommandInput);
const decodePaymentPreference = Schema.decodeUnknownEffect(AgentSharePaymentPreference);
const decodeDevices = Schema.decodeUnknownEffect(AgentShareAccountDevices);
const decodeRevocation = Schema.decodeUnknownEffect(Schema.Struct({ ok: Schema.Literal(true) }));

type AccountSession = {
  readonly identity: AccountIdentity;
  readonly request: (
    route: string,
    body?: Schema.Json,
    idempotencyKey?: string,
  ) => Effect.Effect<unknown, AgentShareAccountError>;
};

export class WalletClient extends Context.Service<
  WalletClient,
  {
    readonly withAccountSession: <A, E, R>(
      owner: string,
      use: (session: AccountSession) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | AgentShareAccountError, R>;
    readonly read: (
      input: AgentShareWalletReadInput,
    ) => Effect.Effect<AgentShareWalletReadResult, AgentShareAccountError>;
    readonly command: (
      input: AgentShareWalletCommandInput,
    ) => Effect.Effect<AgentShareWalletCommandResult, AgentShareAccountError>;
  }
>()("@agentshare/account-client/WalletClient") {}

type Session = {
  readonly key: string;
  readonly identity: AccountIdentity;
  readonly client: HttpClient.HttpClient;
};

function identityKey(identity: AccountIdentity): string {
  return [identity.owner, identity.consoleUrl, identity.deviceId, identity.userId].join("\0");
}

function validConsoleUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/[A-Za-z0-9_/-]*$/.test(url.pathname) &&
      !url.pathname.split("/").includes("..")
    );
  } catch {
    return false;
  }
}

const make = Effect.gen(function* () {
  const connection = yield* AccountConnection;
  const http = yield* HttpClient.HttpClient;
  const lock = yield* Semaphore.make(1);
  let current: Session | undefined;

  const identity = Effect.fn("WalletClient.identity")(function* (owner: string) {
    const value = yield* connection.identity();
    if (value.owner !== owner)
      return yield* new AgentShareAccountError({
        operation: "identity",
        category: "account-changed",
      });
    if (
      !validConsoleUrl(value.consoleUrl) ||
      !/^[a-f0-9-]{36}$/.test(value.userId) ||
      !value.deviceId ||
      value.owner === "offline"
    )
      return yield* new AgentShareAccountError({
        operation: "identity",
        category: "sign-in-required",
      });
    return value;
  });

  const json = Effect.fn("WalletClient.json")(function* (
    session: Session,
    route: string,
    body?: Schema.Json,
    csrf?: string,
    method?: "DELETE",
    idempotencyKey?: string,
  ) {
    const base = session.identity.consoleUrl.replace(/\/$/, "");
    let request = HttpClientRequest.make(method ?? (body === undefined ? "GET" : "POST"))(
      base + route,
    ).pipe(
      HttpClientRequest.setHeader("Accept", "application/json"),
      HttpClientRequest.setHeader("Origin", new URL(base).origin),
      HttpClientRequest.setHeader("Cache-Control", "no-store"),
    );
    if (idempotencyKey !== undefined)
      request = request.pipe(HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey));
    if (csrf !== undefined)
      request = request.pipe(HttpClientRequest.setHeader("X-CSRF-Token", csrf));
    return yield* session.client
      .execute(body === undefined ? request : request.pipe(HttpClientRequest.bodyJsonUnsafe(body)))
      .pipe(
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300)
            return Effect.fail(
              new AgentShareAccountError({
                operation: "session",
                category: response.status === 401 ? "sign-in-required" : "rejected",
                status: response.status,
              }),
            );
          if (Number(response.headers["content-length"] ?? 0) > 2 * 1024 * 1024)
            return Effect.fail(
              new AgentShareAccountError({ operation: "session", category: "invalid-response" }),
            );
          return response.json.pipe(
            Effect.mapError(
              (cause) =>
                new AgentShareAccountError({
                  operation: "session",
                  category: "invalid-response",
                  cause,
                }),
            ),
          );
        }),
        Effect.timeout("15 seconds"),
        Effect.mapError((cause) =>
          isAccountError(cause)
            ? cause
            : new AgentShareAccountError({
                operation: "session",
                category:
                  body === undefined && method === undefined ? "unavailable" : "outcome-unknown",
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

  const ready = Effect.fn("WalletClient.ready")(function* (owner: string) {
    const verified = yield* identity(owner);
    const key = identityKey(verified);
    if (current?.key !== key) {
      const cookies = yield* Ref.make<ReadonlyArray<Cookies.Cookie>>([]);
      current = { key, identity: verified, client: http.pipe(HttpClient.withCookiesRef(cookies)) };
    }
    const session = current;
    const decodeMe = Schema.decodeUnknownEffect(Me);
    let me = yield* json(session, "/v1/me").pipe(
      Effect.flatMap(decodeMe),
      Effect.catchTags({
        AgentShareAccountError: (error) =>
          error.category === "sign-in-required" ? Effect.succeed(null) : Effect.fail(error),
      }),
      Effect.mapError((cause) =>
        isAccountError(cause)
          ? cause
          : new AgentShareAccountError({
              operation: "session",
              category: "invalid-response",
              cause,
            }),
      ),
    );
    if (me === null) {
      const ticket = yield* connection.sessionTicket(owner);
      if (!/^[a-f0-9]{64}$/.test(ticket))
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "invalid-response",
        });
      if (identityKey(yield* identity(owner)) !== key)
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "account-changed",
        });
      yield* json(session, "/auth/device-login", { ticket });
      me = yield* json(session, "/v1/me").pipe(
        Effect.flatMap(decodeMe),
        Effect.mapError((cause) =>
          isAccountError(cause)
            ? cause
            : new AgentShareAccountError({
                operation: "session",
                category: "invalid-response",
                cause,
              }),
        ),
      );
    }
    if (me.user_id !== verified.userId)
      return yield* new AgentShareAccountError({
        operation: "session",
        category: "account-changed",
      });
    return { ...session, csrf: me.csrf };
  });

  const read = Effect.fn("WalletClient.read")(
    function* (input: AgentShareWalletReadInput) {
      const decoded = yield* decodeReadInput(input).pipe(
        Effect.mapError(
          (cause) => new AgentShareAccountError({ operation: "read", category: "rejected", cause }),
        ),
      );
      const session = yield* ready(decoded.owner);
      let result: AgentShareWalletReadResult;
      if (decoded.action === "overview") {
        const raw = yield* json(session, "/v1/market/overview");
        const data = yield* decodeOverview(raw).pipe(
          Effect.mapError(
            (cause) =>
              new AgentShareAccountError({
                operation: "overview",
                category: "invalid-response",
                cause,
              }),
          ),
        );
        result = { action: "overview", owner: decoded.owner, data };
      } else if (decoded.action === "devices") {
        const data = yield* json(session, "/v1/market/overview").pipe(
          Effect.flatMap(decodeDevices),
          Effect.mapError((cause) =>
            isAccountError(cause)
              ? cause
              : new AgentShareAccountError({
                  operation: "devices",
                  category: "invalid-response",
                  cause,
                }),
          ),
        );
        result = {
          action: "devices",
          owner: decoded.owner,
          data: { ...data, current_device_id: session.identity.deviceId },
        };
      } else if (decoded.action === "history") {
        const query = new URLSearchParams({ cursor: decoded.cursor });
        let route = "/v1/market/history";
        if (decoded.workbench_task_id !== undefined) {
          if (decoded.kind !== "spending") {
            return yield* new AgentShareAccountError({
              operation: "history",
              category: "rejected",
            });
          }
          route = "/v1/market/workbench-task-deals";
          query.set("task", decoded.workbench_task_id);
        } else {
          query.set("kind", decoded.kind);
        }
        const data = yield* json(session, `${route}?${query}`).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(History)),
          Effect.mapError((cause) =>
            isAccountError(cause)
              ? cause
              : new AgentShareAccountError({
                  operation: "history",
                  category: "invalid-response",
                  cause,
                }),
          ),
        );
        result = {
          action: "history",
          owner: decoded.owner,
          kind: decoded.kind,
          data: { items: data.items, next_cursor: data.next_cursor ?? "" },
        };
      } else {
        const data = yield* json(
          session,
          `/v1/market/deals/${encodeURIComponent(decoded.request_id)}`,
        ).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(AgentShareWalletDetail)),
          Effect.mapError((cause) =>
            isAccountError(cause)
              ? cause
              : new AgentShareAccountError({
                  operation: "detail",
                  category: "invalid-response",
                  cause,
                }),
          ),
        );
        if (data.request_id !== decoded.request_id)
          return yield* new AgentShareAccountError({
            operation: "detail",
            category: "invalid-response",
          });
        result = { action: "detail", owner: decoded.owner, data };
      }
      if (identityKey(yield* identity(decoded.owner)) !== session.key)
        return yield* new AgentShareAccountError({
          operation: "read",
          category: "account-changed",
        });
      return result;
    },
    (effect) => lock.withPermit(effect),
  );

  const command = Effect.fn("WalletClient.command")(
    function* (input: AgentShareWalletCommandInput) {
      const decoded = yield* decodeCommandInput(input).pipe(
        Effect.mapError(
          (cause) =>
            new AgentShareAccountError({
              operation: "paymentPreference",
              category: "rejected",
              cause,
            }),
        ),
      );
      const session = yield* ready(decoded.owner);
      if (identityKey(yield* identity(decoded.owner)) !== session.key)
        return yield* new AgentShareAccountError({
          operation: "paymentPreference",
          category: "account-changed",
        });
      if (decoded.action === "revokeDevice") {
        if (decoded.device_id === session.identity.deviceId)
          return yield* new AgentShareAccountError({
            operation: "revokeDevice",
            category: "rejected",
          });
        yield* json(
          session,
          `/v1/market/devices/${encodeURIComponent(decoded.device_id)}`,
          undefined,
          session.csrf,
          "DELETE",
        ).pipe(
          Effect.flatMap(decodeRevocation),
          Effect.mapError((cause) =>
            isAccountError(cause) && cause.status !== undefined && cause.status < 500
              ? cause
              : new AgentShareAccountError({
                  operation: "revokeDevice",
                  category: "outcome-unknown",
                  cause,
                }),
          ),
        );
        if (identityKey(yield* identity(decoded.owner)) !== session.key)
          return yield* new AgentShareAccountError({
            operation: "revokeDevice",
            category: "account-changed",
          });
        return {
          action: "revokeDevice" as const,
          owner: decoded.owner,
          data: { device_id: decoded.device_id, ok: true as const },
        };
      }
      const data = yield* json(
        session,
        "/v1/market/payment-preference",
        {
          currency: decoded.currency,
          earnings_first: decoded.earnings_first,
        },
        session.csrf,
      ).pipe(
        Effect.flatMap(decodePaymentPreference),
        Effect.mapError((cause) =>
          isAccountError(cause) && cause.status !== undefined && cause.status < 500
            ? cause
            : new AgentShareAccountError({
                operation: "paymentPreference",
                category: "outcome-unknown",
                cause,
              }),
        ),
      );
      if (data.currency !== decoded.currency || data.earnings_first !== decoded.earnings_first)
        return yield* new AgentShareAccountError({
          operation: "paymentPreference",
          category: "outcome-unknown",
        });
      if (identityKey(yield* identity(decoded.owner)) !== session.key)
        return yield* new AgentShareAccountError({
          operation: "paymentPreference",
          category: "account-changed",
        });
      return { action: "paymentPreference" as const, owner: decoded.owner, data };
    },
    (effect) => lock.withPermit(effect),
  );

  const withAccountSession: WalletClient["Service"]["withAccountSession"] = Effect.fn(
    "WalletClient.withAccountSession",
  )(
    function* (owner, use) {
      const session = yield* ready(owner);
      if (identityKey(yield* identity(owner)) !== session.key)
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "account-changed",
        });
      const request = Effect.fn("WalletClient.accountRequest")(function* (
        route: string,
        body?: Schema.Json,
        idempotencyKey?: string,
      ) {
        if (identityKey(yield* identity(owner)) !== session.key)
          return yield* new AgentShareAccountError({
            operation: "session",
            category: "account-changed",
          });
        return yield* json(
          session,
          route,
          body,
          body === undefined ? undefined : session.csrf,
          undefined,
          idempotencyKey,
        );
      });
      const result = yield* use({
        identity: session.identity,
        request,
      });
      if (identityKey(yield* identity(owner)) !== session.key)
        return yield* new AgentShareAccountError({
          operation: "session",
          category: "account-changed",
        });
      return result;
    },
    (effect) => lock.withPermit(effect),
  );

  return WalletClient.of({ read, command, withAccountSession });
});

export const layer = Layer.effect(WalletClient, make);
