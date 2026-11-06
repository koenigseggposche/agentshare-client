import { fetch } from "expo/fetch";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/http";

export const accountFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await fetch(input, init);
  const headers = response.headers;
  // Native Headers lacks getSetCookie; keep the private account jar outside the OS cookie store.
  Object.defineProperty(headers, "getSetCookie", {
    value: () =>
      response._rawHeaders
        .filter(([name]) => name.toLowerCase() === "set-cookie")
        .flatMap(([, value]) =>
          // Foundation folds Set-Cookie fields; the comma in Expires is not a separator.
          value.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/),
        ),
  });
  Object.defineProperty(response, "headers", { value: headers });
  return response;
};

export const layer = Layer.fresh(FetchHttpClient.layer).pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, accountFetch)),
);
