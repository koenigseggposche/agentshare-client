import type { UiTranslator } from "@t3tools/shared/uiMessages";
import { uiTranslators } from "@t3tools/shared/uiMessages";
import type { StatusTone } from "../../components/StatusPill";
import type { RemoteClientConnectionState } from "../../lib/connection";

export function connectionTone(
  state: RemoteClientConnectionState,
  uiText: UiTranslator = uiTranslators.en,
): StatusTone {
  switch (state) {
    case "connected":
      return {
        label: uiText("Connected"),
        pillClassName: "bg-adaptive-emerald-500-a12-a16",
        textClassName: "text-adaptive-emerald-700-300",
      };
    case "reconnecting":
      return {
        label: uiText("Reconnecting"),
        pillClassName: "bg-warning",
        textClassName: "text-warning-foreground",
      };
    case "connecting":
      return {
        label: uiText("Connecting"),
        pillClassName: "bg-update",
        textClassName: "text-update-foreground",
      };
    case "unsupported":
      return {
        label: uiText("Client not supported"),
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
    case "error":
      return {
        label: uiText("Connection failed"),
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "offline":
      return {
        label: uiText("Offline"),
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "available":
      return {
        label: uiText("Available"),
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
  }
}
