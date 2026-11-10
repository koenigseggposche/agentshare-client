import type { WorkspaceState } from "../../state/workspaceModel";

export interface WorkspaceConnectionStatusPresentation {
  readonly label: string;
  readonly showsProgress: boolean;
}

function shouldShowWorkspaceConnectionStatus(state: WorkspaceState): boolean {
  if (state.networkStatus === "offline") return true;
  if (state.hasReadyEnvironment) return state.hasSyncingConnectedEnvironment;
  return (
    state.connectionError !== null ||
    state.hasConnectingEnvironment ||
    state.hasPendingShellSnapshot ||
    (state.hasLoadedShellSnapshot && !state.hasReadyEnvironment)
  );
}

function workspaceConnectionStatusLabel(state: WorkspaceState, language: "zh" | "en"): string {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  if (state.networkStatus === "offline") return t("设备已离线", "You are offline");
  if (state.hasReadyEnvironment && state.hasSyncingConnectedEnvironment) {
    return state.hasLoadedShellSnapshot
      ? t("正在同步会话…", "Syncing threads...")
      : t("正在加载会话…", "Loading threads...");
  }
  if (state.connectingEnvironments.length === 1) {
    const { environmentLabel } = state.connectingEnvironments[0]!;
    return t(`正在重连 ${environmentLabel}`, `Reconnecting to ${environmentLabel}`);
  }
  if (state.connectingEnvironments.length > 1) {
    const count = state.connectingEnvironments.length;
    return t(`正在重连 ${count} 台工作台`, `Reconnecting ${count} environments`);
  }
  if (state.connectionError !== null) return state.connectionError;
  if (state.hasPendingShellSnapshot) {
    return state.hasLoadedShellSnapshot
      ? t("正在同步会话…", "Syncing threads...")
      : t("正在加载会话…", "Loading threads...");
  }
  return t("尚未连接", "Not connected");
}

export function workspaceConnectionStatusPresentation(
  state: WorkspaceState,
  language: "zh" | "en" = "en",
): WorkspaceConnectionStatusPresentation | null {
  if (!shouldShowWorkspaceConnectionStatus(state)) return null;
  return {
    label: workspaceConnectionStatusLabel(state, language),
    showsProgress:
      state.networkStatus !== "offline" &&
      (state.hasReadyEnvironment || state.connectionError === null) &&
      (state.connectingEnvironments.length > 0 || state.hasPendingShellSnapshot),
  };
}
