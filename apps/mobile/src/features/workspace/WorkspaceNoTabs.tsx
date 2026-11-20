import { useUiText } from "../../i18n/uiText";
import { useNavigation } from "@react-navigation/native";
import { View } from "react-native";
import { EmptyState } from "../../components/ui/EmptyState";
import { openSettings } from "../settings/settings-navigation";

export function WorkspaceNoTabs() {
  const uiText = useUiText();
  const navigation = useNavigation();
  return (
    <View className="flex-1 items-center justify-center bg-screen">
      <EmptyState
        title={uiText("All sections are hidden")}
        detail="Show a section to add it back to navigation."
        actionLabel="Edit navigation tabs"
        variant="plain"
        onAction={() => openSettings(navigation, "SettingsNavigation")}
      />
    </View>
  );
}
