import { useUiText } from "../../i18n/uiText";
import { View } from "react-native";
import { Text } from "@expo/ui/jetpack-compose";
import { IconButton } from "../../components/ui/IconButton";
import { NativeAppBar } from "../../components/ui/NativeAppBar.android";

export function NativeAppBarExample() {
  const uiText = useUiText();
  return (
    <NativeAppBar
      title={<Text style={{ fontSize: 21 }}>{uiText("Native app bar")}</Text>}
      navigationIcon={
        <IconButton
          icon="arrow.left"
          accessibilityLabel={uiText("Example back")}
          onPress={() => {}}
        />
      }
      actions={
        <View className="flex-row">
          <IconButton
            icon="magnifyingglass"
            accessibilityLabel={uiText("Example search")}
            onPress={() => {}}
          />
        </View>
      }
    />
  );
}
