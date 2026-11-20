import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import type { OrchestrationV2UserMessageInputIntent } from "@t3tools/contracts";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
  uiText: UiTranslator = uiTranslators.en,
): UserMessageIntentBadgePresentation | null {
  switch (intent) {
    case "steer":
      return {
        label: uiText("Steer"),
        accessibilityLabel: uiText("Steered the active turn"),
      };
    case "promoted_queued_to_steer":
      return {
        label: uiText("Steer"),
        accessibilityLabel: uiText("Originally queued, then promoted to steer the active turn"),
      };
    case "queued_turn":
    case "turn_start":
    case undefined:
      return null;
  }
}
