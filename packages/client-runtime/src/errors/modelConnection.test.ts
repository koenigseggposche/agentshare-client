import { expect, it } from "vite-plus/test";
import { localizeModelConnectionMessage } from "./modelConnection.ts";

it("localizes curated connection failures and preserves arbitrary diagnostics", () => {
  const message =
    "Cannot reach Gateway. Check the execution computer's network connection and local network access, then retry.";
  expect(localizeModelConnectionMessage(message, "zh")).toBe(
    "无法连接 Gateway。请检查执行电脑的网络连接和本地网络访问权限，然后重试。",
  );
  expect(localizeModelConnectionMessage(message, "en")).toBe(message);
  const diagnostic = "Failed to read report.csv: invalid delimiter";
  expect(localizeModelConnectionMessage(diagnostic, "zh")).toBe(diagnostic);
});

it("keeps interrupted requests explicitly non-replayed in Chinese", () => {
  const message =
    "The model connection was interrupted. The request was not retried automatically. Check any partial output or changes before retrying.";
  expect(localizeModelConnectionMessage(message, "zh")).toBe(
    "模型连接已中断，此请求未自动重试。请先检查已有输出或文件改动，再决定是否重试。",
  );
});
