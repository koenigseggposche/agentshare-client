import { type UiTranslator, uiTranslators } from "@t3tools/shared/uiMessages";
import type { MenuAction } from "@react-native-menu/menu";

export function buildThreadTitleRegenerationMenuItems(
  input: {
    readonly supported: boolean;
    readonly isRegenerating: boolean;
  },
  uiText: UiTranslator = uiTranslators.en,
): MenuAction[] {
  if (!input.supported) return [];

  return [
    {
      id: "regenerate-title",
      title: input.isRegenerating ? uiText("Regenerating…") : uiText("Regenerate title"),
      image: "arrow.clockwise",
      ...(input.isRegenerating ? { attributes: { disabled: true } } : {}),
    },
  ];
}
