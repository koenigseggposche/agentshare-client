import { expect, it } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type AgentShareModelInfo,
} from "@t3tools/contracts";
import {
  filterAgentShareModels,
  hasAgentShareModelConnection,
  agentSharePickerItems,
} from "./agentShareModelCatalog.ts";

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

it("uses Ops order and names while retaining runtime availability and source identity", () => {
  const configured = {
    revision: 4,
    groups: [
      {
        id: "custom",
        name: "My models",
        icon: "qwen",
        enabled: true,
        models: [
          {
            id: "second",
            name: "First choice",
            service: "codex" as const,
            runtimes: ["codex" as const],
            enabled: true,
            local: true,
            community: false,
            recommended: true,
          },
          {
            id: "first",
            name: "Other choice",
            service: "codex" as const,
            runtimes: ["codex" as const],
            enabled: true,
            local: true,
            community: true,
            recommended: false,
          },
        ],
      },
    ],
  };
  const entry = (
    id: string,
    source: "local" | "owned" | "community",
    available = true,
  ): AgentShareModelInfo => ({
    name: id,
    model: {
      id,
      source,
      service: "codex",
      runtime: "codex",
      ...(source === "owned" ? { device: "other-computer" } : {}),
    },
    runtimes: ["codex"],
    available,
    subagents: true,
    search: true,
  });
  const models = [
    entry("first", "local", false),
    entry("second", "community"),
    entry("second", "owned"),
    entry("first", "community"),
    entry("unlisted", "local"),
  ];
  const items = agentSharePickerItems(configured, models);
  expect(items.map((item) => item.info.name)).toEqual([
    "First choice",
    "Other choice",
    "Other choice",
  ]);
  expect(items.map((item) => item.tab)).toEqual(["local", "local", "community"]);
  expect(items[0]?.info.model.device).toBe("other-computer");
  expect(items[1]?.info.available).toBe(false);
  expect(new Set(items.map((item) => item.key)).size).toBe(3);
  expect(
    agentSharePickerItems(
      { ...configured, groups: [{ ...configured.groups[0]!, enabled: false }] },
      models,
    ),
  ).toEqual([]);
});
