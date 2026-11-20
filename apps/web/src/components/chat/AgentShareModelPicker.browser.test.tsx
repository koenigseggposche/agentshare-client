import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type AgentShareModelInfo,
  type AgentSharePickerCatalog,
  type ProviderInstanceConfigMap,
  type ServerSettings,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { createRef } from "react";
import { render } from "../../../test/render";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { AgentShareModelPicker } from "./AgentShareModelPicker";
import "~/index.css";

const state = vi.hoisted(() => ({
  language: "zh" as "zh" | "en",
  configure: vi.fn(),
  toggle: vi.fn(),
  refresh: vi.fn(),
  instances: {} as ProviderInstanceConfigMap,
  favorites: [] as NonNullable<ServerSettings["favorites"]>,
}));
vi.mock(import("../../hooks/useSettings"), async (original) => ({
  ...(await original()),
  useClientSettings: ((select: (value: { uiLanguage: "zh" | "en" }) => unknown) =>
    select({ uiLanguage: state.language })) as never,
  useEnvironmentSettings: (() => state.instances) as never,
  useEnvironmentModelPreferences: (() => ({
    favorites: state.favorites,
    providerModelPreferences: {},
  })) as never,
  useToggleEnvironmentModelFavorite: (() => state.toggle) as never,
}));
vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: { models, catalog },
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
const catalog: AgentSharePickerCatalog = {
  revision: 7,
  groups: [
    {
      id: "coding",
      name: "Ops Coding",
      icon: "codex",
      enabled: true,
      models: [
        {
          id: "b",
          name: "Ops First",
          service: "codex",
          runtimes: ["codex"],
          enabled: true,
          local: true,
          community: true,
          recommended: true,
        },
        {
          id: "a",
          name: "Ops Second",
          service: "codex",
          runtimes: ["codex"],
          enabled: true,
          local: true,
          community: true,
          recommended: false,
        },
      ],
    },
  ],
};
const models: AgentShareModelInfo[] = (["local", "community"] as const).flatMap((source) =>
  ["a", "b"].map((id) => ({
    name: id,
    model: { id, source, service: "codex" as const, runtime: "codex" as const },
    runtimes: ["codex"],
    available: source === "local" || id === "b",
    subagents: true,
    search: true,
  })),
);
function setup(owner: string) {
  state.language = "zh";
  state.configure.mockReset();
  state.toggle.mockReset();
  state.refresh.mockReset();
  state.favorites = [];
  const instanceId = ProviderInstanceId.make("local-connection");
  state.instances = {
    [instanceId]: {
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      config: {
        agentShareOwner: owner,
        agentShareModel: models.find((m) => m.model.source === "local" && m.model.id === "b")!
          .model,
      },
    },
  };
  return instanceId;
}
function entry(id: ProviderInstanceId) {
  return deriveProviderInstanceEntries([
    {
      instanceId: id,
      driver: ProviderDriverKind.make("codex"),
      displayName: "Generated connection",
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [{ slug: "b", name: "Ops First", isCustom: false, capabilities: {} }],
      slashCommands: [],
      skills: [],
    },
  ])[0]!;
}
it("keeps favorites tied to their source and follows the global language while selecting", async () => {
  const owner = "picker-favorites-owner",
    id = setup(owner),
    select = vi.fn(),
    entries = [entry(id)];
  state.toggle.mockImplementation(async (provider, model) => {
    state.favorites = [{ provider, model }];
  });
  const props = {
    environmentId: EnvironmentId.make("picker-favorites"),
    owner,
    activeInstanceId: id,
    model: "b",
    lockedProvider: null,
    instanceEntries: entries,
    modelOptionsByInstance: new Map([[id, entries[0]!.models]]),
    terminalOpen: false,
    searchInputRef: createRef<HTMLInputElement>(),
    onInstanceModelChange: select,
  };
  await using screen = await render(<AgentShareModelPicker {...props} />);
  await page.getByRole("button", { name: "收藏模型", exact: true }).first().click();
  expect(state.toggle).toHaveBeenCalledWith(id, "b");
  await screen.rerender(<AgentShareModelPicker {...props} />);
  await page.getByRole("tab", { name: "收藏", exact: true }).click();
  await expect.element(page.getByRole("button", { name: /Ops First.*本机/ })).toBeVisible();
  state.language = "en";
  await screen.rerender(<AgentShareModelPicker {...props} />);
  await expect
    .element(page.getByRole("tab", { name: "Favorites", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Ops First.*This host/ }).click();
  expect(select).toHaveBeenCalledExactlyOnceWith(id, "b");
  expect(state.configure).not.toHaveBeenCalled();
  await page.getByRole("tab", { name: "Community", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: /Ops Second.*Unavailable/ }))
    .toBeDisabled();
  await page.getByRole("searchbox").fill("Ops Second");
  await expect.element(page.getByRole("button", { name: /Ops Second.*This host/ })).toBeVisible();
});

it("creates the exact community connection once and waits for readiness before selection", async () => {
  const owner = "picker-create-owner",
    id = setup(owner),
    nextId = ProviderInstanceId.make("community-connection"),
    select = vi.fn();
  const entries = [entry(id)];
  const props = {
    environmentId: EnvironmentId.make("picker-create"),
    owner,
    activeInstanceId: id,
    model: "b",
    lockedProvider: null,
    instanceEntries: entries,
    modelOptionsByInstance: new Map([[id, entries[0]!.models]]),
    terminalOpen: false,
    searchInputRef: createRef<HTMLInputElement>(),
    onInstanceModelChange: select,
  };
  state.configure.mockResolvedValue({ _tag: "Failure" });
  await using screen = await render(<AgentShareModelPicker {...props} />);
  await page.getByRole("tab", { name: "社区", exact: true }).click();
  await page.getByRole("button", { name: /Ops First.*社区/ }).click();
  await expect.element(page.getByText("连接未能建立，请重试。", { exact: true })).toBeVisible();
  expect(select).not.toHaveBeenCalled();
  state.configure.mockResolvedValue({ _tag: "Success", value: { instanceId: nextId } });
  await page.getByRole("button", { name: /Ops First.*社区/ }).click();
  expect(state.configure).toHaveBeenLastCalledWith({
    environmentId: props.environmentId,
    input: { owner, model: { id: "b", service: "codex", source: "community", runtime: "codex" } },
  });
  await expect.element(page.getByText("正在准备模型连接…", { exact: true })).toBeVisible();
  expect(select).not.toHaveBeenCalled();
  const next = entry(nextId);
  await screen.rerender(
    <AgentShareModelPicker
      {...props}
      instanceEntries={[...entries, next]}
      modelOptionsByInstance={new Map([...props.modelOptionsByInstance, [nextId, next.models]])}
    />,
  );
  await vi.waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(nextId, "b"));
  await screen.rerender(
    <AgentShareModelPicker
      {...props}
      instanceEntries={[...entries, next]}
      modelOptionsByInstance={new Map([...props.modelOptionsByInstance, [nextId, next.models]])}
    />,
  );
  expect(select).toHaveBeenCalledTimes(1);
});

it("cancels pending selection and supports tab navigation in a narrow window", async () => {
  const owner = "picker-cancel-owner",
    id = setup(owner),
    nextId = ProviderInstanceId.make("cancelled-connection");
  const select = vi.fn(),
    close = vi.fn(),
    entries = [entry(id)];
  const props = {
    environmentId: EnvironmentId.make("picker-cancel"),
    owner,
    activeInstanceId: id,
    model: "b",
    lockedProvider: null,
    instanceEntries: entries,
    modelOptionsByInstance: new Map([[id, entries[0]!.models]]),
    terminalOpen: false,
    searchInputRef: createRef<HTMLInputElement>(),
    onInstanceModelChange: select,
    onRequestClose: close,
  };
  state.configure.mockResolvedValue({ _tag: "Success", value: { instanceId: nextId } });
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(390, 720);
  await using _restoreViewport = {
    [Symbol.asyncDispose]: () => page.viewport(viewport.width, viewport.height),
  };
  await using screen = await render(<AgentShareModelPicker {...props} />);
  await page.getByRole("searchbox").click();
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(page.getByRole("button", { name: /Ops Second.*本机/ })).toHaveFocus();
  await page.getByRole("tab", { name: "本地", exact: true }).click();
  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(page.getByRole("tab", { name: "社区", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Ops First.*社区/ }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  const next = entry(nextId);
  await screen.rerender(
    <AgentShareModelPicker
      {...props}
      instanceEntries={[...entries, next]}
      modelOptionsByInstance={new Map([...props.modelOptionsByInstance, [nextId, next.models]])}
    />,
  );
  expect(select).not.toHaveBeenCalled();
  const panel = screen.container.querySelector<HTMLElement>("[data-agentshare-model-picker]")!;
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  await page.getByRole("searchbox").click();
  await userEvent.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});
