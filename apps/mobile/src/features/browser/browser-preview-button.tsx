import { useUiText } from "../../i18n/uiText";
import { Pressable, View } from "react-native";

import { AppText } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";

export function BrowserPreviewButton(props: {
  readonly count: number;
  readonly onPress: () => void;
  readonly compact?: boolean;
}) {
  const uiText = useUiText();
  const compact = props.compact ?? true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        props.count === 1 ? uiText("View browser") : uiText("View {0} browser tabs", [props.count])
      }
      accessibilityHint={uiText("Watch and control browser tabs open in this thread")}
      onPress={props.onPress}
      className={
        compact
          ? "size-11 shrink-0 items-center justify-center rounded-full active:bg-subtle"
          : "h-11 shrink-0 flex-row items-center justify-center gap-2 rounded-full px-4 active:bg-subtle"
      }
    >
      <SymbolView name="globe" size={20} tintColorClassName="accent-icon" type="monochrome" />
      {!compact ? (
        <AppText className="font-t3-medium text-xs text-foreground">
          {props.count === 1 ? uiText("One tab open") : uiText("{0} tabs open", [props.count])}
        </AppText>
      ) : props.count > 1 ? (
        <View className="absolute right-1.5 top-1.5 min-w-4 items-center rounded-full bg-primary px-1">
          <AppText className="text-2xs font-t3-bold text-primary-foreground">{props.count}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
