import { EnvironmentId, type AgentShareWalletReadInput } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { AgentShareWallet } from "./AgentShareWallet";

vi.mock(import("../../state/agentShare"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { agentShareEnvironment } = await original();
  return {
    agentShareEnvironment: {
      ...agentShareEnvironment,
      wallet: (({ input }: { input: AgentShareWalletReadInput }) => input) as never,
      walletCommand: {
        ...agentShareEnvironment.walletCommand,
        permissionAtom: () => Atom.make(false),
      },
    },
  };
});

vi.mock(import("../../state/query"), async (original) => {
  const { useState } = await import("react");
  function useWalletQuery(input: AgentShareWalletReadInput) {
    const [refreshed, setRefreshed] = useState(false);
    return {
      data:
        input.action === "history" && input.workbench_task_id === "task:generated"
          ? {
              ...input,
              data: {
                items: [
                  {
                    model: input.cursor ? "Second task record" : "First task record",
                    request_id: "generated-request",
                    currency: "USD",
                    status: refreshed ? "settled" : "charged",
                    charged_micros: 2000,
                  },
                ],
                next_cursor: input.cursor ? "" : "page-two",
              },
            }
          : input.action === "detail"
            ? {
                ...input,
                data: {
                  request_id: input.request_id,
                  currency: "USD",
                  status: refreshed ? "settled" : "charged",
                  charged_micros: 2000,
                  earned_micros: 1400,
                  usage: {},
                  rate: {
                    model: "Fixture model",
                    input_micros_per_million: 1000000,
                    output_micros_per_million: 2000000,
                  },
                },
              }
            : null,
      error: null,
      isPending: false,
      refresh: () => setRefreshed(true),
    };
  }
  return { ...(await original()), useEnvironmentQuery: useWalletQuery as never };
});

it("keeps task charges scoped when paging, refreshing settlement, and returning from a request", async () => {
  await using _screen = await render(
    <AgentShareWallet
      environmentId={EnvironmentId.make("generated-host")}
      owner="generated-owner"
      language="zh"
      taskId="task:generated"
    />,
  );
  await expect.element(page.getByText("First task record", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "已登录设备" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect.element(page.getByText("Second task record", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "详情" }).click();
  await expect.element(page.getByText("Provider 收益", { exact: true })).toBeVisible();
  await expect.element(page.getByText("已扣费", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "刷新账单" }).click();
  await expect.element(page.getByText("已结算", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回任务账单" }).click();
  await expect.element(page.getByText("First task record", { exact: true })).toBeVisible();
});
