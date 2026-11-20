import { uiTranslators, type UiTranslator, type UiMessageValues } from "@t3tools/shared/uiMessages";
import { useSyncExternalStore } from "react";
import { getClientSettingsSnapshot, subscribeClientSettingsSnapshot } from "./clientSettingsStore";

const getLanguage = () => getClientSettingsSnapshot().uiLanguage;

export function useUiText() {
  return uiTranslators[
    useSyncExternalStore(subscribeClientSettingsSnapshot, getLanguage, getLanguage)
  ];
}

export function readUiTranslator() {
  return uiTranslators[getLanguage()];
}

export function readUiText(message: string, values?: UiMessageValues) {
  return readUiTranslator()(message, values);
}

// App-lifetime listeners read the current preference when each event arrives.
export const liveUiText = Object.defineProperty(readUiText, "language", {
  get: getLanguage,
}) as UiTranslator;
