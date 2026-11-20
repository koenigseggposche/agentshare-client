import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { useClientSettings } from "../../hooks/useSettings";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { AgentShareModels } from "../agentshare/AgentShareModels";
import { Button } from "../ui/button";

export function AgentShareWelcomeModels({ environmentId }: { environmentId: EnvironmentId }) {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  const host = state.error ? undefined : state.data?.host;
  return (
    <div className="space-y-3">
      {state.isPending ? (
        <p role="status">
          {t("正在读取执行电脑的模型设置…", "Loading this host’s model settings…")}
        </p>
      ) : null}
      {state.error ? (
        <div role="alert" className="space-y-2">
          <p>
            {t(
              "暂时无法连接模型服务。请检查执行电脑后重试。",
              "The model host is unavailable. Check the computer and retry.",
            )}
          </p>
          <Button variant="outline" size="sm" onClick={() => state.refresh()}>
            {t("重试", "Retry")}
          </Button>
        </div>
      ) : null}
      {host ? (
        <AgentShareModels environmentId={environmentId} owner={host.owner} language={language} />
      ) : null}
      <Button
        variant="ghost-muted"
        size="sm"
        render={<Link to="/settings/providers" search={{ machine: environmentId }} />}
      >
        {t("账号与模型设置", "Account and model settings")}
      </Button>
    </div>
  );
}
