import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { replaceClientSettingsSnapshot } from "../src/i18n/clientSettingsStore";

// Existing UI fixtures use English; language-switch tests set their own preference.
replaceClientSettingsSnapshot({ ...DEFAULT_CLIENT_SETTINGS, uiLanguage: "en" });
