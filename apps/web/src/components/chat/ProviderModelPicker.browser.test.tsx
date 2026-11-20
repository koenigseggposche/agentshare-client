import { ProviderDriverKind, ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../test/render";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";

it("keeps each registry image when adding a model from another ACP agent", async () => {
  const icons = [
    "https://cdn.agentclientprotocol.com/registry/icons/picker-explicit.svg",
    "https://cdn.agentclientprotocol.com/registry/v1/latest/picker-by-id.svg",
  ];
  const cache = await caches.open("t3-acp-registry-icons-v1");
  await using _cachedIcons = {
    async [Symbol.asyncDispose]() {
      await Promise.all(icons.map((url) => cache.delete(url)));
    },
  };
  for (const [index, url] of icons.entries()) {
    await cache.put(
      url,
      new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${11 + index * 6}" height="10"><path d="M0 0h10v10H0z"/></svg>`,
        { headers: { "content-type": "image/svg+xml" } },
      ),
    );
  }
  const entries = deriveProviderInstanceEntries(
    ["First", "Second"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make("acpRegistry"),
      displayName: `${name} agent`,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  ).map((entry, index) => ({
    ...entry,
    ...(index === 0 ? { acpRegistryIconUrl: icons[0] } : { acpRegistryAgentId: "picker-by-id" }),
  }));
  const first = { instanceId: entries[0]!.instanceId, model: "first" };
  const options = new Map(entries.map((entry) => [entry.instanceId, entry.models]));

  function Picker() {
    const [selection, setSelection] = useState<ReadonlyArray<ModelSelection>>([first]);
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={first.instanceId}
        model={first.model}
        {...(selection.length > 1 ? { selectedModels: selection } : {})}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        onToggleModel={(instanceId, model) => setSelection([...selection, { instanceId, model }])}
        onInstanceModelChange={(instanceId, model) => setSelection([{ instanceId, model }])}
      />
    );
  }

  await using screen = await render(<Picker />);
  const imageWidths = () =>
    Array.from(
      screen.container.querySelectorAll<HTMLImageElement>("[data-chat-provider-model-picker] img"),
      (image) => image.naturalWidth,
    );
  await vi.waitFor(() => expect(imageWidths()).toEqual([11]));
  await screen.getByRole("button", { name: "First model", exact: true }).click();
  // All connections are immediately reachable, without an icon-only provider tab.
  await expect.element(page.getByRole("option", { name: /Second model/ })).toBeVisible();
  await userEvent.keyboard("{Shift>}");
  try {
    await page.getByRole("option", { name: /Second model/ }).click();
  } finally {
    await userEvent.keyboard("{/Shift}");
  }
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(imageWidths()).toEqual([11, 17]));
});

it("selects from all connections in one click and closes the picker", async () => {
  const entries = deriveProviderInstanceEntries(
    ["First", "Second"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make("codex"),
      displayName: `${name} connection`,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  );
  function Picker() {
    const [selection, setSelection] = useState({
      instanceId: entries[0]!.instanceId,
      model: "first",
    });
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={selection.instanceId}
        model={selection.model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={new Map(entries.map((entry) => [entry.instanceId, entry.models]))}
        onInstanceModelChange={(instanceId, model) => setSelection({ instanceId, model })}
      />
    );
  }
  await using screen = await render(<Picker />);
  await screen.getByRole("button", { name: "First model", exact: true }).click();
  await expect
    .element(page.getByRole("option", { name: /First model.*First connection/ }))
    .toBeVisible();
  await page.getByRole("option", { name: /Second model.*Second connection/ }).click();
  await expect
    .element(page.getByRole("combobox", { name: /Search models|搜索模型/ }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Second model", exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Second model", exact: true }).click();
  await page.getByRole("option", { name: /Second model.*Second connection/ }).click();
  await expect
    .element(page.getByRole("combobox", { name: /Search models|搜索模型/ }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Second model", exact: true }).click();
  const connection = page.getByRole("combobox", { name: /Connection|连接来源/ });
  await connection.selectOptions("second");
  await expect.element(page.getByRole("option", { name: /First model/ })).not.toBeInTheDocument();
  const search = page.getByRole("combobox", { name: /Search models|搜索模型/ });
  await search.fill("First connection");
  await expect.element(page.getByRole("option", { name: /First model/ })).toBeVisible();
  await search.fill("");
  await expect.element(page.getByRole("option", { name: /Second model/ })).toBeVisible();
  await page.getByRole("button", { name: /All models|全部模型/, exact: true }).click();
  await expect.element(page.getByRole("option", { name: /First model/ })).toBeVisible();
  await userEvent.keyboard("{Escape}");
});
