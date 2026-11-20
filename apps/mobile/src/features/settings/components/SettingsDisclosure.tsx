import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { RowPressable } from "../../../components/ui/RowPressable";
import { ListRowLayout } from "../../../components/ui/ListRowLayout";

export function SettingsDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowPressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <ListRowLayout label={title} />
      </RowPressable>
      <View
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        style={{ display: open ? "flex" : "none" }}
      >
        {children}
      </View>
    </>
  );
}
