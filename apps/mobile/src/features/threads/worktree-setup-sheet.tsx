import { useUiText } from "../../i18n/uiText";
import type { ReactElement } from "react";
import { Sheet } from "../../components/ui/Sheet";

export interface WorktreeSetupSheetProps {
  children: ReactElement;
  height: number;
  onClose: () => void;
}

export function WorktreeSetupSheet({ children, onClose }: WorktreeSetupSheetProps) {
  const uiText = useUiText();
  return (
    <Sheet title={uiText("Worktree setup")} onClose={onClose}>
      {children}
    </Sheet>
  );
}
