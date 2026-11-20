import { translateUiLabels } from "@t3tools/shared/uiMessages";
import { useUiText } from "../../i18n/uiText";
import { ChevronDownIcon } from "lucide-react";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { ThreadDetailsItemsMenuItems } from "../chat/ThreadDetailsItemsMenu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  THREAD_DETAILS_ITEMS,
} from "../chat/threadDetailsItems";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function ThreadDetailsItemsRow() {
  const uiText = useUiText();
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  const enabled = translateUiLabels(THREAD_DETAILS_ITEMS, uiText).filter(
    (item) => visibility[item.id],
  ).length;
  return (
    <SettingsRow
      {...searchableSetting("thread-details-items")}
      description={uiText(
        "Choose what the thread details card shows. You can also right-click the card.",
      )}
      resetAction={
        isDefaultThreadDetailsVisibility(visibility, uiText) ? null : (
          <SettingResetButton
            label={uiText("thread details")}
            onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
          />
        )
      }
      control={
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between sm:w-40"
                aria-label={uiText("Thread details: {0} of {1} on", [
                  enabled,
                  THREAD_DETAILS_ITEMS.length,
                ])}
              />
            }
          >
            {enabled}
            {uiText(" of ")}
            {translateUiLabels(THREAD_DETAILS_ITEMS, uiText).length}
            {uiText(" on")}
            <ChevronDownIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            <ThreadDetailsItemsMenuItems />
          </MenuPopup>
        </Menu>
      }
    />
  );
}
