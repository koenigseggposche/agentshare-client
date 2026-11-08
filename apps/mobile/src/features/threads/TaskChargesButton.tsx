import {
  AuthAccessWriteScope,
  type EnvironmentId,
  type OrchestrationV2ProjectedTurnItem,
} from "@t3tools/contracts";
import { useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Sheet } from "../../components/ui/Sheet";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { useV2ItemSupport } from "../../state/v2-item-support";
import { agentShareTaskId } from "@t3tools/shared/agentShareTaskId";
import { AgentShareWalletSection } from "../settings/AgentShareWalletSection";
import { agentShareEnvironment } from "../../state/agentShare";
import { useWorkbenchLanguage } from "../workspace/navigation-tabs";
export function TaskChargesButton(props: {
  readonly environmentId: EnvironmentId;
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
}) {
  const language = useWorkbenchLanguage();
  const title = language === "zh" ? "任务账单" : "Task charges";
  const [open, setOpen] = useState(false);
  const { environmentId, projectedItem } = props;
  const support = useV2ItemSupport({
    environmentId,
    sourceThreadId: projectedItem.sourceThreadId,
    sourceItemId: projectedItem.sourceItemId,
  });
  const canReadHostWallet = useEnvironmentScope(environmentId, AuthAccessWriteScope);
  const state = useEnvironmentQuery(
    open && canReadHostWallet ? agentShareEnvironment.state({ environmentId, input: {} }) : null,
  );
  if (!canReadHostWallet || !support.hasWorkbenchTaskBilling || support.run === null) return null;
  const host = state.error ? undefined : state.data?.host;
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} className="px-2 py-1">
        <Text className="text-xs text-foreground-secondary">{title}</Text>
      </Pressable>
      {open ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <ScrollView contentInsetAdjustmentBehavior="automatic">
            {host?.paired ? (
              <AgentShareWalletSection
                key={host.owner}
                environmentId={environmentId}
                owner={host.owner}
                language={language}
                taskId={agentShareTaskId(support.run.id)}
              />
            ) : (
              <Text className="px-5 py-2">
                {state.isPending
                  ? language === "zh"
                    ? "正在读取账号…"
                    : "Loading account…"
                  : language === "zh"
                    ? "请连接已登录的执行电脑。"
                    : "Connect to a signed-in execution host."}
              </Text>
            )}
          </ScrollView>
        </Sheet>
      ) : null}
    </>
  );
}
