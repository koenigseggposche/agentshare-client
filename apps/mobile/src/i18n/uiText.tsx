import { useSyncExternalStore } from "react";
import {
  uiTranslators,
  type UiLanguage,
  type UiMessageValues,
  type UiTranslator,
} from "@t3tools/shared/uiMessages";

let language: UiLanguage = "zh";
const listeners = new Set<() => void>();
const getLanguage = () => language;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function setUiLanguage(value: UiLanguage) {
  if (language === value) return;
  language = value;
  for (const listener of listeners) listener();
}

export function useUiText() {
  return uiTranslators[useSyncExternalStore(subscribe, getLanguage, getLanguage)];
}

export function readUiTranslator() {
  return uiTranslators[language];
}

export function readUiText(message: string, values?: UiMessageValues) {
  return readUiTranslator()(message, values);
}

export const liveUiText = Object.defineProperty(readUiText, "language", {
  get: getLanguage,
}) as UiTranslator;
