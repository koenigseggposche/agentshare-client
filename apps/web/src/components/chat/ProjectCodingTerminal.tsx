import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { AgentShareManagedTerminal } from "../agentshare/AgentShareManagedTerminal";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useClientSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogTrigger,
} from "../ui/dialog";

export function ProjectCodingTerminal({
  environmentId,
  directory,
}: {
  environmentId: EnvironmentId;
  directory: string;
}) {
  const [open, setOpen] = useState(false);
  const language = useClientSettings((settings) => settings.uiLanguage);
  const allowed = useAtomValue(agentShareEnvironment.prepareTerminal.permissionAtom(environmentId));
  const state = useEnvironmentQuery(
    open && allowed ? agentShareEnvironment.state({ environmentId, input: {} }) : null,
  );
  const host = state.error ? undefined : state.data?.host;
  const title = language === "zh" ? "编程终端" : "Coding terminal";
  if (!allowed) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="ghost" />}>{title}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          {open && host?.paired ? (
            <AgentShareManagedTerminal
              key={`${environmentId}:${host.owner}:${directory}`}
              environmentId={environmentId}
              initialDirectory={directory}
              owner={host.owner}
              supported={host.features.includes("interactive-cli")}
              visible={open}
              language={language}
            />
          ) : (
            <p role="status">
              {state.isPending
                ? language === "zh"
                  ? "正在读取账号…"
                  : "Loading account…"
                : language === "zh"
                  ? "请在账号与安全中登录这台执行电脑。"
                  : "Sign in to this host in Account and security."}
            </p>
          )}
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
