import { agentShareTaskId } from "@t3tools/shared/agentShareTaskId";
import { AgentShareWallet } from "../agentshare/AgentShareWallet";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { useClientSettings } from "../../hooks/useSettings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { AuthAccessWriteScope, type OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { use, useState } from "react";
import { Button } from "../ui/button";
import { useV2ItemSupport } from "../../state/v2ItemSupport";
import { TimelineRowCtx } from "./timelineRowContext";

export function TaskChargesButton({
  projectedItem,
}: {
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
}) {
  const { activeThreadEnvironmentId: environmentId } = use(TimelineRowCtx);
  const language = useClientSettings((settings) => settings.uiLanguage);
  const title = language === "zh" ? "任务账单" : "Task charges";
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="xs" variant="ghost" />}>
        {title}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          {open && host?.paired ? (
            <AgentShareWallet
              key={host.owner}
              environmentId={environmentId}
              owner={host.owner}
              language={language}
              taskId={agentShareTaskId(support.run.id)}
            />
          ) : (
            <p role="status">
              {state.isPending
                ? language === "zh"
                  ? "正在读取账号…"
                  : "Loading account…"
                : language === "zh"
                  ? "请连接已登录的执行电脑。"
                  : "Connect to a signed-in execution host."}
            </p>
          )}
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
