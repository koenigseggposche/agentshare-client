import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import type { RefObject } from "react";
import { anchoredToastManager } from "./toast";

export const ANCHORED_COPY_TOAST_TIMEOUT_MS = 1000;

export function showAnchoredCopySuccessToast(
  ref: RefObject<HTMLButtonElement | null>,
  uiText: UiTranslator = uiTranslators.en,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: uiText("Copied!"),
  });
}

export function showAnchoredCopyErrorToast(
  ref: RefObject<HTMLButtonElement | null>,
  error: Error,
  uiText: UiTranslator = uiTranslators.en,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    type: "error",
    positionerProps: {
      anchor: ref.current,
    },
    title: uiText("Failed to copy"),
    description: error.message,
  });
}
