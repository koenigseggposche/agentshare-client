import { type StaticScreenProps } from "@react-navigation/native";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AgentShareManagedTerminal } from "../settings/AgentShareManagedTerminal";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useProjects, useThreadShell } from "../../state/entities";
import { useWorkbenchLanguage } from "../workspace/navigation-tabs";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";

export function ProjectCodingTerminalRouteScreen({
  route,
}: StaticScreenProps<{ environmentId: string; threadId: string }>) {
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const language = useWorkbenchLanguage();
  const thread = useThreadShell(
    scopeThreadRef(environmentId, ThreadId.make(route.params.threadId)),
  );
  const project = useProjects().find(
    (entry) => entry.environmentId === environmentId && entry.id === thread?.projectId,
  );
  const directory = thread?.worktreePath ?? project?.workspaceRoot;
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  const host = state.error ? undefined : state.data?.host;
  return (
    <ScreenScrollView>
      {host?.paired && directory ? (
        <AgentShareManagedTerminal
          key={`${environmentId}:${host.owner}:${directory}`}
          environmentId={environmentId}
          initialDirectory={directory}
          owner={host.owner}
          supported={host.features.includes("interactive-cli")}
          language={language}
        />
      ) : (
        <Text>
          {state.isPending
            ? language === "zh"
              ? "正在读取账号…"
              : "Loading account…"
            : language === "zh"
              ? "请打开一个项目，并在账号与安全中登录执行电脑。"
              : "Open a project and sign in to its host in Account and security."}
        </Text>
      )}
    </ScreenScrollView>
  );
}
