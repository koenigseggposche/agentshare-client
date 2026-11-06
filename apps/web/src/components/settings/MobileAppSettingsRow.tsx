import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function MobileAppSettingsRow() {
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description="Install a verified AgentShare preview build on your iPhone, iPad or Android device, then connect it to your execution computer with a pairing link."
    />
  );
}
