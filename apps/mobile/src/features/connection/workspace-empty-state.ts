import type { WorkspaceConnectionState } from "../../state/workspaceModel";

export function workspaceConnectionEmptyState(
  catalogState: WorkspaceConnectionState,
  language: "zh" | "en",
): { readonly title: string; readonly detail: string; readonly loading: boolean } | null {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  if (catalogState.isLoadingConnections) {
    return {
      title: t("正在加载环境", "Loading environments"),
      detail: t("正在读取此设备保存的环境。", "Checking saved environments on this device."),
      loading: true,
    };
  }

  if (!catalogState.hasConnections) {
    return {
      title: t("尚未连接工作台", "No environments connected"),
      detail: t(
        "添加环境后即可加载项目并开始会话。",
        "Add an environment to load projects and start coding sessions.",
      ),
      loading: false,
    };
  }

  if (!catalogState.hasReadyEnvironment) {
    if (catalogState.networkStatus === "offline") {
      return {
        title: t("设备未联网", "Device is offline"),
        detail: t(
          "恢复网络连接后会同步项目和会话。",
          "Projects and conversations will sync once this device is back online.",
        ),
        loading: false,
      };
    }
    if (catalogState.hasConnectingEnvironment) {
      return {
        title: t("正在连接工作台", "Connecting to environment"),
        detail: t(
          "连接恢复后会同步项目和会话。",
          "Projects and conversations will sync when the connection is restored.",
        ),
        loading: true,
      };
    }
    return {
      title:
        catalogState.connectionState === "unsupported"
          ? t("客户端版本不受支持", "Client not supported")
          : t("工作台暂不可用", "Environment unavailable"),
      detail:
        catalogState.connectionError ??
        t(
          "请检查网络和工作台状态，再到设置中的环境页面重试。",
          "Check the network and workbench, then retry in Settings → Environments.",
        ),
      loading: false,
    };
  }

  return null;
}
