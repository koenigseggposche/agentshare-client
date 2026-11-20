import { chineseMessages } from "./uiMessages.zh.ts";

export type UiLanguage = "zh" | "en";
export type UiMessageValues = ReadonlyArray<string | number | boolean | null | undefined>;

export function translateUiMessage(
  language: UiLanguage,
  message: string,
  values: UiMessageValues = [],
): string {
  const key = message.trim();
  const translated =
    language === "zh" && Object.hasOwn(chineseMessages, key) ? chineseMessages[key] : undefined;
  const text = translated === undefined ? message : message.replace(key, () => translated);
  return text.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = values[Number(index)];
    return Number(index) >= values.length ? placeholder : String(value);
  });
}

export const uiTranslators = {
  zh: Object.assign(
    (message: string, values?: UiMessageValues) => translateUiMessage("zh", message, values),
    { language: "zh" as const },
  ),
  en: Object.assign(
    (message: string, values?: UiMessageValues) => translateUiMessage("en", message, values),
    { language: "en" as const },
  ),
} as const;

export interface UiTranslator {
  (message: string, values?: UiMessageValues): string;
  readonly language: UiLanguage;
}

const uiMetadataCache = { zh: new WeakMap<object, unknown>(), en: new WeakMap<object, unknown>() };

// Only pass immutable, authored UI metadata; user content stays outside this boundary.
export function translateUiLabels<T>(metadata: T, translate: UiTranslator): T {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    "$$typeof" in metadata ||
    Object.getOwnPropertySymbols(metadata).length > 0
  )
    return metadata;
  if (!Array.isArray(metadata) && Object.getPrototypeOf(metadata) !== Object.prototype)
    return metadata;
  const cache = uiMetadataCache[translate.language];
  if (cache.has(metadata)) return cache.get(metadata) as T;
  const result = Array.isArray(metadata)
    ? metadata.map((entry) => translateUiLabels(entry, translate))
    : Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [
          key,
          typeof value === "string" &&
          /^(title|label|description|placeholder|accessibilityLabel|accessibilityHint|message|subtitle|tooltip|hint)$/.test(
            key,
          )
            ? translate(value)
            : translateUiLabels(value, translate),
        ]),
      );
  cache.set(metadata, result);
  return result as T;
}
