import { useUiText } from "../../i18n/uiText";
import { useRef } from "react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function AboutVersionTitle() {
  const uiText = useUiText();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: "version",
    onCopy: () => showAnchoredCopySuccessToast(copyButtonRef, uiText),
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: uiText("Could not copy version"),
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{uiText("Version")}</span>
      <code className="text-2xs font-medium">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                ref={copyButtonRef}
                tone="muted"
                aria-label={uiText("Copy version {0}", [APP_VERSION])}
                onClick={() => copyToClipboard(APP_VERSION, undefined)}
              >
                {APP_VERSION}
              </InlineButton>
            }
          />
          <TooltipPopup>{uiText("Copy version")}</TooltipPopup>
        </Tooltip>
      </code>
    </span>
  );
}
