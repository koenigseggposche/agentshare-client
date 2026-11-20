import { useState } from "react";
import { useClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function InterfaceLanguageSetting() {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const [failed, setFailed] = useState(false);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  return (
    <SettingsSection title={t("语言", "Language")}>
      <SettingsRow
        id="interface-language"
        title={t("界面语言", "Interface language")}
        description={t(
          "用于此客户端的界面、菜单和通知。",
          "Applies to this client's interface, menus and notifications.",
        )}
        status={
          failed
            ? t("语言未能保存，请重试。", "The language could not be saved. Try again.")
            : undefined
        }
        control={
          <Select
            value={language}
            onValueChange={(value) => {
              if (value !== "en" && value !== "zh") return;
              setFailed(false);
              void updateClientSettings({ uiLanguage: value }).catch(() => setFailed(true));
            }}
          >
            <SelectTrigger aria-label={t("界面语言", "Interface language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="zh">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}
