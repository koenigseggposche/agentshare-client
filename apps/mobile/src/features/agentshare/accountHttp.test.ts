import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type * as Cookies from "effect/http/Cookies";
import { vi } from "vite-plus/test";

const nativeFetch = vi.hoisted(() => vi.fn<typeof globalThis.fetch>());
vi.mock("expo/fetch", () => ({ fetch: nativeFetch }));

import * as AccountHttp from "./accountHttp";

it.effect.each([false, true])("keeps native account cookies isolated when folded=%s", (folded) =>
  Effect.gen(function* () {
    const cookieFields = [
      "session=generated-private-session; Path=/console; Secure; HttpOnly; Expires=Wed, 21 Oct 2037 07:28:00 GMT",
      "unrelated=; Path=/elsewhere; Max-Age=0; Secure",
    ];
    const rawHeaders: Array<[string, string]> = (
      folded ? [cookieFields.join(", ")] : cookieFields
    ).map((value) => ["Set-Cookie", value]);
    const response = new Response("{}", { headers: rawHeaders });
    const headers = response.headers;
    Object.defineProperty(headers, "getSetCookie", { value: undefined, configurable: true });
    Object.defineProperties(response, {
      headers: { value: headers, configurable: true },
      _rawHeaders: { value: rawHeaders },
    });
    const sent: Array<{
      cookie: string | null;
      credentials?: RequestCredentials;
      redirect?: RequestRedirect;
    }> = [];
    using _fetch = nativeFetch.mockImplementation((_input, init) => {
      sent.push({
        cookie: new Headers(init?.headers).get("cookie"),
        credentials: init?.credentials,
        redirect: init?.redirect,
      });
      return Promise.resolve(
        sent.length === 1
          ? response
          : Object.defineProperty(new Response("{}"), "_rawHeaders", { value: [] }),
      );
    });
    const ref = yield* Ref.make<ReadonlyArray<Cookies.Cookie>>([]);
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.withCookiesRef(ref));
    yield* client.execute(HttpClientRequest.get("https://example.invalid/console/login"));
    yield* client.execute(HttpClientRequest.get("https://example.invalid/console/v1/me"));
    assert.equal(sent[1]?.cookie, "session=generated-private-session");
    assert.isTrue(
      sent.every((request) => request.credentials === "omit" && request.redirect === "manual"),
    );
  }).pipe(
    Effect.provide(AccountHttp.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit", redirect: "manual" }),
  ),
);
