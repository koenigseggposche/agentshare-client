import "~/index.css";
import { EnvironmentId, type AgentShareWalletReadInput } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { cdp, page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { AgentShareWallet } from "./AgentShareWallet";

const requestId = "0123456789abcdef".repeat(4);

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
    const estimated = input.owner === "estimated-owner";
    const status = refreshed ? "settled" : estimated ? "estimated" : "charged";
    return {
      data:
        input.action === "history" && input.workbench_task_id === "task:generated"
          ? {
              ...input,
              data: {
                items: [
                  {
                    model: input.cursor ? "Second task record" : "First task record",
                    request_id: requestId,
                    currency: "USD",
                    status,
                    charged_micros: 2000,
                    started_at: "2026-11-09T04:30:00.000Z",
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
                  status,
                  charged_micros: 2000,
                  earned_micros: 1400,
                  usage: estimated ? { estimated: true } : {},
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
  await expect.element(page.getByText(/2026年11月[89]日/)).toBeVisible();
  await expect.element(page.getByText(/2026-11-09T04:30/)).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "已登录设备" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect.element(page.getByText("Second task record", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "详情" }).click();
  await expect.element(page.getByText("Provider 待结算收益", { exact: true })).toBeVisible();
  await expect.element(page.getByText("已扣费", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "刷新账单" }).click();
  await expect.element(page.getByText("已结算", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回任务账单" }).click();
  await expect.element(page.getByText("Second task record", { exact: true })).toBeVisible();
});

it("keeps a full request identifier readable in a narrow wallet panel", async () => {
  await using _screen = await render(
    <div style={{ width: 280 }} aria-label="Wallet panel">
      <AgentShareWallet
        environmentId={EnvironmentId.make("generated-host")}
        owner="generated-owner"
        language="en"
        taskId="task:generated"
      />
    </div>,
  );
  const panel = page.getByLabelText("Wallet panel");
  await expect.element(panel.getByText(requestId, { exact: false })).toBeVisible();
  const assertFits = () => {
    const { scrollWidth, clientWidth } = panel.element();
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  };
  assertFits();
  await panel.getByRole("button", { name: "Details" }).click();
  await expect.element(panel.getByText(requestId, { exact: true })).toBeVisible();
  assertFits();
});

it("keeps usage estimation separate from whether Provider earnings have settled", async () => {
  await using _screen = await render(
    <AgentShareWallet
      environmentId={EnvironmentId.make("generated-host")}
      owner="estimated-owner"
      language="zh"
      taskId="task:generated"
    />,
  );
  await expect.element(page.getByText(/已按估算用量扣费/)).toBeVisible();
  await page.getByRole("button", { name: "详情" }).click();
  await expect.element(page.getByText("按估算用量扣费", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Provider 待结算收益", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "刷新账单" }).click();
  await expect.element(page.getByText("已结算", { exact: true })).toBeVisible();
  await expect.element(page.getByText("按估算用量扣费", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Provider 收益", { exact: true })).toBeVisible();
});

it("uses the current device timezone when wallet history is opened again", async () => {
  const session = cdp();
  try {
    for (const [zone, day] of [
      ["Asia/Shanghai", 9],
      ["America/Los_Angeles", 8],
    ] as const) {
      await session.send("Emulation.setTimezoneOverride", { timezoneId: zone });
      await using _screen = await render(
        <AgentShareWallet
          environmentId={EnvironmentId.make("generated-host")}
          owner="generated-owner"
          language="zh"
          taskId="task:generated"
        />,
      );
      await expect.element(page.getByText(`2026年11月${day}日`, { exact: false })).toBeVisible();
    }
  } finally {
    await session.send("Emulation.setTimezoneOverride", { timezoneId: "" });
  }
});
