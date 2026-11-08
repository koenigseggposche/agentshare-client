import type { EnvironmentId } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { useWorkbenchLanguage } from "../workspace/navigation-tabs";
import { ConnectionEnvironmentRow } from "./ConnectionEnvironmentRow";

type EnvironmentRowProps = ComponentProps<typeof ConnectionEnvironmentRow>;

export function LocalEnvironmentList({
  environments,
  expandedId,
  onToggle,
  ...rowActions
}: Pick<
  EnvironmentRowProps,
  "onReconnect" | "onRemove" | "onSetEnabled" | "onUpdate" | "opensDetails"
> & {
  readonly environments: ReadonlyArray<EnvironmentRowProps["environment"]>;
  readonly expandedId: EnvironmentId | null;
  readonly onToggle: (environmentId: EnvironmentId) => void;
}) {
  const language = useWorkbenchLanguage();
  if (environments.length === 0) {
    return (
      <View
        collapsable={false}
        className="items-center gap-3 rounded-[24px] bg-grouped-card px-6 py-8"
      >
        <View className="h-12 w-12 items-center justify-center rounded-[16px] bg-subtle">
          <SymbolView
            name="point.3.connected.trianglepath.dotted"
            size={20}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </View>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          {language === "zh" ? "还没有连接的环境。\n点击 " : "No environments connected yet.\nTap "}
          <Text className="font-t3-bold text-foreground">+</Text>
          {language === "zh" ? " 添加环境。" : " to add one."}
        </Text>
      </View>
    );
  }

  return (
    <View collapsable={false} className="overflow-hidden rounded-[24px] bg-grouped-card">
      {environments.map((environment) => (
        <View key={environment.environmentId} collapsable={false}>
          <ConnectionEnvironmentRow
            environment={environment}
            expanded={expandedId === environment.environmentId}
            onToggle={() => onToggle(environment.environmentId)}
            {...rowActions}
          />
        </View>
      ))}
    </View>
  );
}
