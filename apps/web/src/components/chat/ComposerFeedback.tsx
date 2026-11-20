import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import { readUiText } from "../../i18n/uiText";
import {
  codexFeedbackNotice,
  type CodexFeedbackSubmission,
} from "@t3tools/client-runtime/state/threads";
import { MessageSquareIcon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function feedbackBannerItem(
  submission: CodexFeedbackSubmission,
  onDismiss: () => void,
  uiText: UiTranslator = uiTranslators.en,
): ComposerBannerStackItem | null {
  const notice = codexFeedbackNotice(submission);
  if (!notice) return null;
  return {
    id: `feedback:${submission.id}`,
    variant:
      submission.status === "failed" ? "error" : submission.status === "sent" ? "success" : "info",
    icon: <MessageSquareIcon />,
    ...notice,
    actions:
      submission.status === "sent" ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void writeTextToClipboard(submission.feedbackId, "Codex feedback thread ID").catch(
              (error: unknown) => {
                toastManager.add({
                  type: "error",
                  title: uiText("Could not copy thread ID"),
                  description:
                    error instanceof Error ? error.message : uiText("An error occurred."),
                });
              },
            );
          }}
        >
          {readUiText("Copy ID")}
        </Button>
      ) : undefined,
    ...(submission.status !== "uploading"
      ? { dismissLabel: "Dismiss feedback notice", onDismiss }
      : {}),
  };
}
