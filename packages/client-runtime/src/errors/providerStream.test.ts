import { describe, expect, it } from "vite-plus/test";
import { providerStreamInterruption } from "./providerStream.ts";

describe("provider stream interruption", () => {
  it.each([
    ["responseStreamDisconnected", "Error decoding response body"],
    ["other", "Stream disconnected before completion: Transport error"],
  ])("explains interrupted streams and preserves the diagnostic (%s)", (code, message) => {
    expect(
      providerStreamInterruption({ class: "provider_error", code, message, retryable: null }),
    ).toEqual({
      label: "Model response interrupted",
      detail: `The task stopped before the model finished responding. Check any partial output or changes before retrying. ${message}`,
    });
  });

  it.each([
    ["upstream_unavailable_no_replay", "Model request failed"],
    [
      null,
      'unexpected status 502: {"code":"gateway_response_error","cause":"upstream_unavailable_no_replay"}, url: http://127.0.0.1:12345/v1/responses',
    ],
  ])("explains an interrupted connection without exposing proxy details (%s)", (code, message) => {
    expect(
      providerStreamInterruption({ class: "provider_error", code, message, retryable: null }),
    ).toEqual({
      label: "Model connection interrupted",
      detail:
        "The model connection was interrupted. The request was not retried automatically. Check any partial output or changes before retrying.",
    });
  });

  it("leaves other provider errors alone", () => {
    expect(
      providerStreamInterruption({
        class: "provider_error",
        code: null,
        message: "Error decoding response body",
        retryable: null,
      }),
    ).toBeUndefined();
  });
});
