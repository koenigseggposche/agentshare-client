import {
  AgentShareModel,
  agentShareModelsMatch,
  resolveProviderInstanceEnabled,
  type AgentShareModelInfo,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { ModelSourceFilter } from "./workbenchLabels.ts";

export function filterAgentShareModels(
  models: ReadonlyArray<AgentShareModelInfo>,
  source: ModelSourceFilter,
  search: string,
) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return models
    .filter((entry) => {
      if (source !== "all" && entry.model.source !== source) return false;
      const text = [entry.name, entry.model.id, entry.device_name ?? "", entry.model.runtime]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => Number(b.available) - Number(a.available));
}

const isModelConnection = Schema.is(
  Schema.Struct({ agentShareOwner: Schema.String, agentShareModel: AgentShareModel }),
);

export function hasAgentShareModelConnection(
  instances: ProviderInstanceConfigMap,
  owner: string,
  model: AgentShareModel,
): boolean {
  return Object.values(instances).some(
    (instance) =>
      resolveProviderInstanceEnabled(instance) &&
      isModelConnection(instance.config) &&
      instance.config.agentShareOwner === owner &&
      instance.config.agentShareModel.runtime === model.runtime &&
      agentShareModelsMatch(instance.config.agentShareModel, model),
  );
}
