import { localizeModelConnectionMessage } from "@t3tools/client-runtime/errors";
import { useWorkbenchLanguage } from "../workspace/navigation-tabs";
import { View } from "react-native";
import { Notice } from "../../components/ui/Notice";

export function ComposerErrorNotice(props: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  const language = useWorkbenchLanguage();
  return (
    <View className="px-4 pb-3">
      <Notice
        message={localizeModelConnectionMessage(props.message, language)}
        icon="exclamationmark.circle"
        iconTone="danger"
        floating
        onDismiss={props.onDismiss}
        dismissLabel={language === "zh" ? "关闭错误提示" : "Dismiss error"}
      />
    </View>
  );
}
