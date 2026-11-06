import { describe, expect, it } from "vite-plus/test";

import { threadErrorSummary } from "./orchestrationV2ThreadError.ts";

describe("thread error summary", () => {
  it("keeps an idle provider disconnect from turning completed work into a retryable failure", () => {
    const sessionError = "The provider event stream closed unexpectedly. Retry the turn.";
    expect(threadErrorSummary(null, sessionError, "completed")).toMatchObject({
      lastError: null,
      lastErrorClass: null,
    });
    for (const status of ["starting", "running", "failed"] as const) {
      expect(threadErrorSummary(null, sessionError, status).lastError).toBe(sessionError);
    }
    const failure = {
      class: "usage_limit" as const,
      message: "Plan limit reached",
      code: "usageLimitExceeded",
      retryable: null,
    };
    expect(threadErrorSummary(failure, failure.message, "failed")).toMatchObject({
      lastError: failure.message,
      lastErrorClass: "usage_limit",
      lastErrorCode: failure.code,
    });
  });
});
