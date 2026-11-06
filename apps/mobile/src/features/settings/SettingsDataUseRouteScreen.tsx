import { useNavigation } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { agentShareDataUse } from "@t3tools/client-runtime/agentshare/data-use";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { SheetCloseButton } from "../../components/ui/SheetHeader";
import { mobilePreferencesAtom } from "../../state/preferences";

export function SettingsDataUseCloseHeaderButton() {
  const navigation = useNavigation();
  return (
    <SheetCloseButton
      accessibilityLabel="Close data explanation"
      onClose={() => navigation.goBack()}
    />
  );
}

export function SettingsDataUseRouteScreen() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const language = AsyncResult.isSuccess(preferences)
    ? (preferences.value.uiLanguage ?? "zh")
    : "zh";
  return (
    <ScreenScrollView className="flex-1 bg-sheet" contentContainerClassName="gap-5 px-5 pt-5 pb-12">
      {agentShareDataUse.map((section) => (
        <Text key={section.id} selectable className="text-base leading-normal text-foreground">
          {language === "zh" ? section.zh : section.en}
        </Text>
      ))}
    </ScreenScrollView>
  );
}
