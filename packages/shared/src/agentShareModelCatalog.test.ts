import { expect, it } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type AgentShareModelInfo,
} from "@t3tools/contracts";
import { filterAgentShareModels, hasAgentShareModelConnection } from "./agentShareModelCatalog.ts";

const offline: AgentShareModelInfo = {
  model: { id: "model-a", source: "community", service: "codex", runtime: "codex" },
  name: "Alpha",
  available: false,
  runtimes: ["codex"],
  subagents: false,
  search: false,
};
const online = {
  ...offline,
  name: "Beta",
  available: true,
  device_name: "Desk One",
  model: { ...offline.model, source: "owned" as const },
};

it("prioritizes available models without mutating catalog order", () => {
  const models = [offline, online];
  expect(filterAgentShareModels(models, "all", "")).toEqual([online, offline]);
  expect(models).toEqual([offline, online]);
});
it("combines source with case-insensitive model, runtime and device terms", () => {
  expect(filterAgentShareModels([offline, online], "owned", " DESK   model-A CODEX ")).toEqual([
    online,
  ]);
  expect(filterAgentShareModels([offline, online], "community", "desk")).toEqual([]);
  expect(filterAgentShareModels([offline, online], "all", "missing")).toEqual([]);
});

it("matches configured model connections by owner, source, runtime and enabled state", () => {
  const instance = {
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    config: { agentShareOwner: "owner-a", agentShareModel: online.model },
  };
  const id = ProviderInstanceId.make("generated");
  expect(hasAgentShareModelConnection({ [id]: instance }, "owner-a", online.model)).toBe(true);
  expect(hasAgentShareModelConnection({ [id]: instance }, "owner-b", online.model)).toBe(false);
  expect(hasAgentShareModelConnection({ [id]: instance }, "owner-a", offline.model)).toBe(false);
  expect(
    hasAgentShareModelConnection({ [id]: instance }, "owner-a", {
      ...online.model,
      runtime: "claude",
    }),
  ).toBe(false);
  expect(
    hasAgentShareModelConnection(
      { [id]: { ...instance, enabled: false } },
      "owner-a",
      online.model,
    ),
  ).toBe(false);
  expect(
    hasAgentShareModelConnection({ [id]: { ...instance, config: {} } }, "owner-a", online.model),
  ).toBe(false);
});
