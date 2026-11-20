import { useUiText } from "../../i18n/uiText";
import type { useReviewHeaderPresentation as useIosReviewHeaderPresentation } from "./useReviewHeaderPresentation";

export function useReviewHeaderPresentation(
  props: Parameters<typeof useIosReviewHeaderPresentation>[0],
): ReturnType<typeof useIosReviewHeaderPresentation> {
  const uiText = useUiText();
  return {
    title: uiText("Review changes"),
    subtitle: props.androidSubtitle || uiText("Select a diff"),
    gitMenu: null,
    menuIcon: "ellipsis.circle",
    refreshAction: {
      id: "refresh",
      title: uiText("Refresh current diff"),
      disabled: !props.selectedSection || props.selectedSection.isLoading,
      onPress: () => {
        void props.onRefresh();
      },
    },
  };
}
