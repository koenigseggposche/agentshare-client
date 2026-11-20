import { translateUiLabels } from "@t3tools/shared/uiMessages";
import { useUiText } from "../../i18n/uiText";
import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { MenuCheckboxItem, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "../ui/menu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

/** Menu body that shows and hides thread details items. The card's context menu and Settings share it. */
export function ThreadDetailsItemsMenuItems() {
  const uiText = useUiText();
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>{uiText("Show in thread details")}</MenuGroupLabel>
        {translateUiLabels(THREAD_DETAILS_ITEMS, uiText).map((item) => (
          <MenuCheckboxItem
            key={item.id}
            checked={visibility[item.id]}
            onCheckedChange={(checked) =>
              updateClientSettings({
                threadDetailsItems: setThreadDetailsItem(getClientSettings(), item, checked),
              })
            }
          >
            {item.label}
          </MenuCheckboxItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem
        disabled={isDefaultThreadDetailsVisibility(visibility, uiText)}
        onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
      >
        {uiText("Reset to default")}
      </MenuItem>
    </>
  );
}
