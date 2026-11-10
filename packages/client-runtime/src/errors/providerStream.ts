import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";

export function providerStreamInterruption(failure: OrchestrationV2ProviderFailure) {
  if (
    failure.code !== "responseStreamDisconnected" &&
    !/^stream disconnected before completion\b/iu.test(failure.message)
  ) {
    return undefined;
  }
  return {
    label: "Model response interrupted",
    detail: `The task stopped before the model finished responding. Check any partial output or changes before retrying. ${failure.message}`,
  };
}
