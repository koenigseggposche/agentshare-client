import { SettingsDisclosure } from "../settings/SettingsDisclosure";
import type { EnvironmentId } from "@t3tools/contracts";
import { useClientSettings } from "../../hooks/useSettings";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { AgentShareModels } from "./AgentShareModels";

export function AgentShareModelConnections({ environmentId }: { environmentId: EnvironmentId }) {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const query = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  if (!query.data || query.error) return null;
  return (
    <SettingsDisclosure title={language === "zh" ? "浏览并添加模型" : "Browse and add models"}>
      <AgentShareModels
        key={`${environmentId}:${query.data.host.owner}`}
        environmentId={environmentId}
        owner={query.data.host.owner}
        language={language}
      />
    </SettingsDisclosure>
  );
}
