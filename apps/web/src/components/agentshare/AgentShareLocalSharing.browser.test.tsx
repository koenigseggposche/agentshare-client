import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { AgentShareLocalSharing } from "./AgentShareLocalSharing";

const state = vi.hoisted(() => ({ command: vi.fn(), refresh: vi.fn() }));

vi.mock(import("../../state/agentShare"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { agentShareEnvironment } = await original();
  return {
    agentShareEnvironment: {
      ...agentShareEnvironment,
      command: {
        ...agentShareEnvironment.command,
        permissionAtom: () => Atom.make(true),
      },
    },
  };
});
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.command) as never,
}));
vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: {
      state: {
        installations: { fixture: { model: { name: "Generated model", share_allowed: true } } },
        runtimes: { fixture: { state: "stopped" } },
      },
      remote_access: { fixture: { visibility: "community", draining: false } },
    },
    error: null,
    isPending: false,
    refresh: state.refresh,
  })) as never,
}));

it("allows stopping sharing after a runtime stops and blocks retrying an uncertain command", async () => {
  state.command.mockReset().mockResolvedValue({ _tag: "Failure" });
  state.refresh.mockClear();
  const environmentId = EnvironmentId.make("generated-host");
  await using screen = await render(
    <AgentShareLocalSharing environmentId={environmentId} owner="generated-owner" language="en" />,
  );
  await expect.element(page.getByRole("button", { name: "Only me" })).toBeDisabled();
  await page.getByRole("button", { name: "Sharing off" }).click();
  expect(state.command).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { operation: "modelSharing", body: { id: "fixture", visibility: "off" } },
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("The outcome is unknown. Refresh and check before retrying.");
  await expect.element(page.getByRole("button", { name: "Sharing off" })).toBeDisabled();
  expect(state.refresh).toHaveBeenCalledOnce();
});
