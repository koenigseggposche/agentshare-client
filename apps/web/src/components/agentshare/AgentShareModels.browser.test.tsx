import { EnvironmentId, type AgentShareModelInfo } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({ configure: vi.fn(), refresh: vi.fn() }));

vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: { models: [local, community] },
    error: null,
    isPending: false,
    refresh: state.refresh,
  })) as never,
}));

vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.configure) as never,
}));

vi.mock(import("../../state/agentShare"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { agentShareEnvironment } = await original();
  return {
    agentShareEnvironment: {
      ...agentShareEnvironment,
      configureModel: {
        ...agentShareEnvironment.configureModel,
        permissionAtom: () => Atom.make(true),
      },
    },
  };
});

import { AgentShareModels } from "./AgentShareModels";

const local: AgentShareModelInfo = {
  model: { id: "fixture", source: "local", service: "codex", runtime: "codex" },
  name: "Fixture local",
  available: true,
  runtimes: ["codex"],
  subagents: false,
  search: false,
};
const community: AgentShareModelInfo = {
  ...local,
  model: { ...local.model, source: "community" },
  name: "Fixture community",
};

it("filters by source and adds the selected community connection", async () => {
  state.configure.mockReset().mockResolvedValue({ _tag: "Success" });
  const environmentId = EnvironmentId.make("generated-host");
  const owner = "generated-owner";
  await using _screen = await render(
    <AgentShareModels environmentId={environmentId} owner={owner} language="zh" />,
  );

  await expect.element(page.getByText(local.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "社区", exact: true }).click();
  await expect.element(page.getByText(local.name, { exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByText(community.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加到工作台" }).click();
  expect(state.configure).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { owner, model: community.model },
  });

  await page.getByRole("button", { name: "我的设备", exact: true }).click();
  await expect.element(page.getByText("这个来源暂时没有会话模型。")).toBeVisible();
  await page.getByRole("button", { name: "全部来源", exact: true }).click();
  await expect.element(page.getByText(local.name, { exact: true })).toBeVisible();
});
