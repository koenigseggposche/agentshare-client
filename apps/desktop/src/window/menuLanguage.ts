import type * as Electron from "electron";
import { translateUiMessage, type UiLanguage } from "@t3tools/shared/uiMessages";

const roleLabels: Readonly<Record<string, string>> = {
  about: "About",
  services: "Services",
  hide: "Hide",
  hideOthers: "Hide Others",
  unhide: "Show All",
  quit: "Quit",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  delete: "Delete",
  selectAll: "Select All",
  startSpeaking: "Start Speaking",
  stopSpeaking: "Stop Speaking",
  togglefullscreen: "Toggle Full Screen",
  windowMenu: "Window",
  minimize: "Minimize",
  zoom: "Zoom",
  front: "Bring All to Front",
  help: "Help",
};

export function localizeApplicationMenu(
  template: ReadonlyArray<Electron.MenuItemConstructorOptions>,
  language: UiLanguage,
): Electron.MenuItemConstructorOptions[] {
  return template.map((item) => {
    const label = item.label ?? (item.role ? roleLabels[item.role] : undefined);
    return {
      ...item,
      ...(label === undefined ? {} : { label: translateUiMessage(language, label) }),
      ...(Array.isArray(item.submenu)
        ? { submenu: localizeApplicationMenu(item.submenu, language) }
        : {}),
    };
  });
}
