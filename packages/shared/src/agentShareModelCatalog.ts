import {
  AgentShareModel,
  agentShareModelsMatch,
  resolveProviderInstanceEnabled,
  type AgentShareModelInfo,
  type AgentSharePickerCatalog,
  type ProviderInstanceId,
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

export function agentSharePickerItems(
  catalog: AgentSharePickerCatalog | null | undefined,
  models: ReadonlyArray<AgentShareModelInfo>,
) {
  return (catalog?.groups ?? [])
    .filter((group) => group.enabled)
    .flatMap((group) =>
      group.models
        .filter((version) => version.enabled)
        .flatMap((version) =>
          models.flatMap((entry) => {
            if (
              entry.model.service !== version.service ||
              entry.model.id !== version.id ||
              !(entry.model.source === "community" ? version.community : version.local)
            )
              return [];
            const runtime = version.runtimes.find(
              (runtime) =>
                entry.runtimes.includes(runtime) &&
                (runtime !== "text" ||
                  (entry.model.source === "local" && entry.model.service === "local")),
            );
            if (!runtime) return [];
            const model = { ...entry.model, runtime };
            return [
              {
                key: JSON.stringify([
                  model.source,
                  model.service,
                  model.id,
                  model.device ?? "",
                  model.runtime,
                  model.policy ?? "",
                ]),
                group,
                version,
                info: { ...entry, name: version.name, model },
                tab: model.source === "community" ? ("community" as const) : ("local" as const),
              },
            ];
          }),
        ),
    );
}

export function findAgentShareModelConnection(
  instances: ProviderInstanceConfigMap,
  owner: string,
  model: AgentShareModel,
): ProviderInstanceId | undefined {
  return Object.entries(instances).find(
    ([, instance]) =>
      resolveProviderInstanceEnabled(instance) &&
      isModelConnection(instance.config) &&
      instance.config.agentShareOwner === owner &&
      instance.config.agentShareModel.runtime === model.runtime &&
      agentShareModelsMatch(instance.config.agentShareModel, model),
  )?.[0] as ProviderInstanceId | undefined;
}
