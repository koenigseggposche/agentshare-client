import type { AgentShareModelInfo } from "@t3tools/contracts";
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
