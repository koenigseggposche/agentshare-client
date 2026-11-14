import { __setClientSettingsForTests, getClientSettings } from "../../hooks/useSettings";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { SidebarProvider } from "../ui/sidebar";
import { SettingsSidebarNav } from "./SettingsSidebarNav";

vi.mock("./useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => [
    { id: "theme", title: "Theme", to: "/settings/appearance" },
    { id: "archive", title: "Archived threads", to: "/settings/archived" },
  ],
}));

it("ignores composing keys in the search", async () => {
  const previous = getClientSettings();
  __setClientSettingsForTests({ ...previous, uiLanguage: "en" });
  onTestFinished(() => __setClientSettingsForTests(previous));
  await using screen = await render(
    <SidebarProvider defaultOpen>
      <SettingsSidebarNav pathname="/settings/general" />
    </SidebarProvider>,
    { router: "/settings/general" },
  );
  const search = page.getByRole("combobox", { name: "Search settings" });
  await search.fill("theme");
  await expect.element(page.getByRole("option", { name: /Theme/ })).toBeVisible();

  for (const composition of [
    { key: "Enter", isComposing: true, keyCode: 13 },
    { key: "Enter", isComposing: false, keyCode: 229 },
    { key: "Escape", isComposing: true, keyCode: 27 },
    { key: "Escape", isComposing: false, keyCode: 229 },
    { key: "ArrowDown", isComposing: true, keyCode: 40 },
    { key: "ArrowUp", isComposing: true, keyCode: 38 },
  ]) {
    const event = new KeyboardEvent("keydown", { ...composition, bubbles: true, cancelable: true });
    await act(() => search.element().dispatchEvent(event));
    expect(event.defaultPrevented, JSON.stringify(composition)).toBe(false);
    expect(screen.router?.state.location.pathname).toBe("/settings/general");
    await expect.element(search).toHaveValue("theme");
  }

  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(screen.router?.state.location.pathname).toBe("/settings/appearance"),
  );
});

it("finds archived chats with Chinese and English search words", async () => {
  const previous = getClientSettings();
  __setClientSettingsForTests({ ...previous, uiLanguage: "zh" });
  onTestFinished(() => __setClientSettingsForTests(previous));
  await using screen = await render(
    <SidebarProvider defaultOpen>
      <SettingsSidebarNav pathname="/settings/general" />
    </SidebarProvider>,
    { router: "/settings/general" },
  );
  const search = page.getByRole("combobox", { name: "搜索设置" });
  for (const query of ["归档", "archived"]) {
    await search.fill(query);
    await expect.element(page.getByRole("option", { name: /已归档会话/ })).toBeVisible();
  }
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(screen.router?.state.location.pathname).toBe("/settings/archived"));
});
