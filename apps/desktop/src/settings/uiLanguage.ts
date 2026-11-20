import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { uiTranslators, type UiLanguage } from "@t3tools/shared/uiMessages";

let language: UiLanguage = DEFAULT_CLIENT_SETTINGS.uiLanguage;
const listeners = new Set<() => void>();

export function publishUiLanguage(value: UiLanguage): void {
  if (value === language) return;
  language = value;
  for (const listener of listeners) listener();
}

export function readUiTranslator() {
  return uiTranslators[language];
}

export function subscribeUiLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
