import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
export function resolveAgentAwarenessPlatformPresentation(
  platform: string,
  uiText: UiTranslator = uiTranslators.en,
): {
  readonly supported: boolean;
  readonly subtitle: string | undefined;
} {
  return platform === "ios" || platform === "android"
    ? { supported: true, subtitle: undefined }
    : { supported: false, subtitle: uiText("Unavailable on this platform") };
}
