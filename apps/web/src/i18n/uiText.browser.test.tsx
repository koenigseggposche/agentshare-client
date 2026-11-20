import { useState } from "react";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { expect, it } from "vite-plus/test";
import { act, render } from "../../test/render";
import { getClientSettingsSnapshot, replaceClientSettingsSnapshot } from "./clientSettingsStore";
import { useUiText } from "./uiText";
import { translateUiLabels } from "@t3tools/shared/uiMessages";

const options = [{ value: "settings", label: "Settings" }];

function LanguageDraft() {
  const uiText = useUiText();
  const [draft, setDraft] = useState("");
  return (
    <>
      <label>
        {uiText("Message")}
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <span>{translateUiLabels(options, uiText)[0]?.label}</span>
    </>
  );
}

it("updates mounted labels in both directions while retaining user draft state", async () => {
  const previous = getClientSettingsSnapshot();
  using _settings = {
    [Symbol.dispose]() {
      replaceClientSettingsSnapshot(previous);
    },
  };
  replaceClientSettingsSnapshot({ ...DEFAULT_CLIENT_SETTINGS, uiLanguage: "en" });
  await using screen = await render(<LanguageDraft />);
  await screen
    .getByRole("textbox", { name: "Message" })
    .fill("Settings /tmp/generated.ts 中文 {0}");
  await act(() =>
    replaceClientSettingsSnapshot({ ...getClientSettingsSnapshot(), uiLanguage: "zh" }),
  );
  await expect.element(screen.getByText("设置", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox"))
    .toHaveValue("Settings /tmp/generated.ts 中文 {0}");
  await act(() =>
    replaceClientSettingsSnapshot({ ...getClientSettingsSnapshot(), uiLanguage: "en" }),
  );
  await expect
    .element(screen.getByRole("textbox", { name: "Message" }))
    .toHaveValue("Settings /tmp/generated.ts 中文 {0}");
  await expect.element(screen.getByText("Settings", { exact: true })).toBeVisible();
});
