import { useUiText } from "../../i18n/uiText";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function MobileAppSettingsRow() {
  const uiText = useUiText();
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description={uiText(
        "Install a verified AgentShare preview build on your iPhone, iPad or Android device, then connect it to your execution computer with a pairing link.",
      )}
    />
  );
}
