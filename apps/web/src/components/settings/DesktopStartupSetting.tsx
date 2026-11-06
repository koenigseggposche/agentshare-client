import { useState } from "react";

import { useClientSettings } from "../../hooks/useSettings";
import { desktopStartupStateAtom, refreshDesktopStartup } from "../../state/desktopStartup";
import { useEnvironmentQuery } from "../../state/query";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function DesktopStartupSetting() {
  const bridge = window.desktopBridge;
  const language = useClientSettings((settings) => settings.uiLanguage);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const query = useEnvironmentQuery(bridge ? desktopStartupStateAtom : null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const state = query.data;
  if (!bridge || (state && !state.supported)) return null;
  const change = async (enabled: boolean) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await bridge.setStartupEnabled(enabled);
    } catch {
      setFailed(true);
    }
    refreshDesktopStartup();
    setPending(false);
  };
  return (
    <SettingsRow
      {...searchableSetting("client-startup")}
      title={t("登录系统时打开客户端", "Open client at sign-in")}
      description={t(
        "登录系统时打开此电脑上的 AgentShare 客户端，保留当前工作台和账号设置。",
        "Open AgentShare Client on this computer when you sign in, using the same account and workbench settings.",
      )}
      status={
        failed || query.error
          ? t(
              "无法确认启动设置，请刷新后核对。",
              "Could not confirm startup settings. Refresh to check.",
            )
          : state?.blocked
            ? t(
                "此启动项已被系统停用，重新打开可恢复。",
                "System startup settings disabled this item. Turn it on to restore it.",
              )
            : undefined
      }
      control={
        <Switch
          aria-label={t("登录系统时打开客户端", "Open client at sign-in")}
          checked={Boolean(state?.enabled && !state.blocked)}
          disabled={pending || !state || query.isPending}
          onCheckedChange={(enabled) => void change(enabled)}
        />
      }
    />
  );
}
