import { useAtomValue } from "@effect/atom-react";

import { environmentCatalog } from "../connection/catalog";
import { isElectron } from "../env";
import { useClientSettings } from "./useSettings";

export function useConnectionCatalogNotice() {
  const status = useAtomValue(environmentCatalog.catalogStatusAtom);
  const language = useClientSettings((settings) => settings.uiLanguage);
  if (status === "ready") return null;
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  return {
    status,
    title:
      status === "loading"
        ? t("正在加载已保存的连接", "Loading saved connections")
        : t("未能加载已保存的连接", "Saved connections could not be loaded"),
    description:
      status === "loading"
        ? isElectron
          ? t(
              "正在读取连接信息。如果系统弹出钥匙串访问提示，请在系统弹窗中完成授权。加载完成后会显示已有会话。",
              "Reading your connections. If the system asks for Keychain access, complete authorization in that dialog. Your existing threads will appear when loading finishes.",
            )
          : t("连接信息仍在加载中，请稍候。", "Your connections are still loading. Please wait.")
        : t(
            "无法确认已有会话是否可用。请检查系统凭据存储是否可访问，再重新打开客户端。",
            "Existing threads could not be checked. Make sure system credential storage is accessible, then reopen the client.",
          ),
  };
}
