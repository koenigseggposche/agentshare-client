import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(
  terminology: ChangeRequestTerminology,
  uiText: UiTranslator = uiTranslators.en,
) {
  return {
    type: "warning",
    title: uiText("Checked out, but not confirmed on the latest commit"),
    description: uiText(
      "This checkout could not be confirmed at the {0}'s latest commit, so its code may differ. Local commits or uncommitted work keep a checkout where it is.",
      [terminology.singular],
    ),
  } as const;
}
