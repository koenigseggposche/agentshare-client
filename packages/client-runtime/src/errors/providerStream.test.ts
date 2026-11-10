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
