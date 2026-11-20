import { useUiText } from "../../../../i18n/uiText";
import { View } from "react-native";

import { ListChoiceRow as SettingsChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

export function AndroidNavigationAppearanceSection() {
  const uiText = useUiText();
  const { isReady, androidNavigationStyle, setAndroidNavigationStyle } = useAppearancePreferences();
  return (
    <SettingsSection title={uiText("Navigation")}>
      <View accessibilityRole="radiogroup">
        <SettingsChoiceRow
          label={uiText("One UI")}
          description={uiText("Floating navigation with a separate compose button.")}
          disabled={!isReady}
          selected={androidNavigationStyle === "one-ui"}
          onPress={() => setAndroidNavigationStyle("one-ui")}
        />
        <SettingsChoiceRow
          label={uiText("Material")}
          description={uiText("Standard Android navigation bar and side rail.")}
          disabled={!isReady}
          selected={androidNavigationStyle === "material"}
          onPress={() => setAndroidNavigationStyle("material")}
          separated
        />
      </View>
    </SettingsSection>
  );
}
