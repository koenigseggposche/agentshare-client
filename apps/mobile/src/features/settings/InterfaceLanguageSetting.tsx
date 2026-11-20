import { useState } from "react";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import * as Exit from "effect/Exit";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsSection } from "./components/SettingsSection";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { AppText } from "../../components/ui/AppText";

export function InterfaceLanguageSetting() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom, { mode: "promiseExit" });
  const [failed, setFailed] = useState(false);
  const language = AsyncResult.isSuccess(preferences)
    ? (preferences.value.uiLanguage ?? "zh")
    : "zh";
  return (
    <SettingsSection title={language === "zh" ? "界面语言" : "Interface language"}>
      {(
        [
          ["zh", "简体中文"],
          ["en", "English"],
        ] as const
      ).map(([value, label]) => (
        <ListChoiceRow
          key={value}
          label={label}
          selected={language === value}
          disabled={!AsyncResult.isSuccess(preferences)}
          onPress={() => {
            setFailed(false);
            void save({ uiLanguage: value }).then((result) => setFailed(Exit.isFailure(result)));
          }}
        />
      ))}
      {failed ? (
        <AppText accessibilityRole="alert">
          {language === "zh"
            ? "语言未能保存，请重试。"
            : "The language could not be saved. Try again."}
        </AppText>
      ) : null}
    </SettingsSection>
  );
}
