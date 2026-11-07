import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { Profiler } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import {
  __setClientSettingsForTests,
  getClientSettings,
  persistClientSettingsPatch,
} from "../../hooks/useSettings";
import { SidebarDraftBlock } from "./SidebarDraftBlock";

it("keeps draft previews current through edits, promotion and removal", async () => {
  const settings = getClientSettings();
  using _settings = {
    [Symbol.dispose]: () => __setClientSettingsForTests(settings),
  };
  __setClientSettingsForTests({ ...settings, uiLanguage: "en" });
  const initial = useComposerDraftStore.getState();
  using _store = {
    [Symbol.dispose]: () => useComposerDraftStore.setState(initial, true),
  };
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const environmentId = EnvironmentId.make("draft-preview-environment");
  const projectRef = scopeProjectRef(environmentId, ProjectId.make("draft-preview-project"));
  const draftId = DraftId.make("draft-preview");
  const threadId = ThreadId.make("draft-preview-thread");
  const onRender = vi.fn();
  await using screen = await render(
    <Profiler id="draft-block" onRender={onRender}>
      <ul>
        <SidebarDraftBlock
          projectByKey={new Map()}
          projectDisplayNameByKey={new Map()}
          scopedProjectKeys={null}
          routeDraftId={null}
          onNavigateToDraft={vi.fn()}
          onDraftContextMenu={vi.fn()}
        />
      </ul>
    </Profiler>,
  );
  const row = screen.getByTestId("sidebar-draft-row");
  await expect.element(row).not.toBeInTheDocument();

  await act(() => {
    initial.setProjectDraftThreadId(projectRef, draftId, { threadId });
    initial.setPrompt(draftId, "First draft preview");
  });
  await expect.element(row).toHaveAccessibleName("First draft preview, Unsent draft");

  const rendersBeforeOtherComposer = onRender.mock.calls.length;
  await act(() =>
    initial.setPrompt(scopeThreadRef(environmentId, ThreadId.make("other")), "Other composer"),
  );
  expect(onRender).toHaveBeenCalledTimes(rendersBeforeOtherComposer);
  await act(() => initial.setPrompt(draftId, "Updated draft preview"));
  await expect.element(row).toHaveAccessibleName("Updated draft preview, Unsent draft");

  await act(() => persistClientSettingsPatch({ uiLanguage: "zh" }, async () => {}));
  await expect.element(row).toHaveAccessibleName("Updated draft preview, 未发送的草稿");
  await expect.element(screen.getByRole("button", { name: "丢弃草稿" })).toBeInTheDocument();
  await act(() => persistClientSettingsPatch({ uiLanguage: "en" }, async () => {}));

  await act(() => initial.markDraftThreadPromoting(draftId));
  await expect.element(row).not.toBeInTheDocument();
  await act(() => initial.clearDraftThread(draftId));

  const nextDraftId = DraftId.make("next-draft-preview");
  await act(() => {
    initial.setProjectDraftThreadId(projectRef, nextDraftId, { threadId: ThreadId.make("next") });
    initial.setPrompt(nextDraftId, "Next draft preview");
  });
  await expect.element(row).toHaveAccessibleName("Next draft preview, Unsent draft");
  await act(() => initial.clearDraftThread(nextDraftId));
  await expect.element(row).not.toBeInTheDocument();
});
