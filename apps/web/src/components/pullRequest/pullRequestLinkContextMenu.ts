import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import type { ContextMenuItem } from "@t3tools/contracts";
import {
  type SourceControlDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

export const openOnHostLabel = (host: SourceControlDefinition): string =>
  host === UNKNOWN_SOURCE_CONTROL_CLIENT ? "Open on host" : `Open on ${host.label}`;

function pullRequestLinkContextMenuItems(
  openLabel: string,
  uiText: UiTranslator = uiTranslators.en,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: uiText("Copy link"), icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

export async function showPullRequestLinkContextMenu(
  {
    url,
    openLabel,
    position,
  }: {
    readonly url: string;
    readonly openLabel: string;
    readonly position: { readonly x: number; readonly y: number };
  },
  uiText: UiTranslator = uiTranslators.en,
): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(
      pullRequestLinkContextMenuItems(openLabel, uiText),
      position,
    );
  } catch {
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title:
        action === "copy-link"
          ? uiText("Could not copy the link")
          : uiText("Could not open the link"),
    });
  }
}
