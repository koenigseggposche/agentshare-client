import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import { useUiText, readUiText } from "../i18n/uiText";
import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { ArrowRightIcon } from "lucide-react";

import {
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateReleaseUrl,
} from "./desktopUpdate.logic";
import { toastManager } from "./ui/toast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

export async function openDesktopUpdateReleaseNotes(
  shell: DesktopUpdateShell | undefined,
  releaseUrl: string,
  uiText: UiTranslator = uiTranslators.en,
): Promise<void> {
  try {
    if (shell && (await shell.openExternal(releaseUrl))) return;
  } catch {}
  toastManager.add({ type: "error", title: uiText("Unable to open release notes") });
}

function ReleaseNotesLink({
  shell,
  releaseUrl,
}: {
  shell: DesktopUpdateShell;
  releaseUrl: string;
}) {
  const uiText = useUiText();
  return (
    <button
      className="ml-2 inline cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
      onClick={() => {
        void openDesktopUpdateReleaseNotes(shell, releaseUrl, uiText);
      }}
      type="button"
    >
      {uiText("Read more")}
      <ArrowRightIcon
        aria-hidden
        className="ml-1 inline size-3 -rotate-45 align-[-0.125em]"
        strokeWidth={2.25}
      />
    </button>
  );
}

export function showDesktopUpdateDownloadedToast(
  shell: DesktopUpdateShell,
  state: DesktopUpdateState,
  uiText: UiTranslator = uiTranslators.en,
): void {
  const releaseUrl = getDesktopUpdateReleaseUrl(getDesktopUpdateDownloadedVersion(state));
  toastManager.add({
    type: "success",
    title: uiText("Update downloaded"),
    description: (
      <>
        {readUiText("Restart the app from the update button to install it.")}
        {releaseUrl ? <ReleaseNotesLink releaseUrl={releaseUrl} shell={shell} /> : null}
      </>
    ),
  });
}
