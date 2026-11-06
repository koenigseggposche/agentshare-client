import type { AgentShareToolOperation } from "@t3tools/contracts";
import { formatModelBytes } from "./agentShareModelManager.ts";

export function toolOperationActive(operation: AgentShareToolOperation) {
  return ["queued", "running", "cancelling"].includes(operation.state);
}
export function toolOperationPresentation(
  operation: AgentShareToolOperation,
  language: "zh" | "en",
) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const states = {
    queued: t("等待安装", "Queued"),
    running: t("正在安装", "Installing"),
    cancelling: t("正在取消", "Cancelling"),
    succeeded: t("安装完成", "Installed"),
    failed: t("安装失败", "Installation failed"),
    cancelled: t("已取消", "Cancelled"),
    interrupted: t(
      "已中断，请刷新核对已安装版本",
      "Interrupted; refresh and check installed versions",
    ),
  };
  const stages: Record<string, string> = {
    resolving: t("查找官方版本", "Finding official release"),
    downloading: t("下载中", "Downloading"),
    verifying: t("校验文件", "Verifying files"),
    committing: t("保存已校验版本", "Saving verified version"),
  };
  const errors: Record<string, string> = {
    offline_tool_platform_unavailable: t(
      "这台执行电脑暂没有匹配的离线工具包。",
      "No matching offline tool bundle is available for this host.",
    ),
    offline_tool_bundle_missing: t(
      "执行电脑上的离线包目录缺少所需文件，请检查路径。",
      "The host bundle directory is missing required files. Check the path.",
    ),
    offline_tool_bundle_invalid: t(
      "离线文件未通过校验，请重新准备官方离线包。",
      "The offline files failed verification. Prepare a fresh official bundle.",
    ),
  };
  return {
    label: `${operation.service === "codex" ? "Codex" : "Claude"} ${operation.version ?? operation.requested_version ?? ""} · ${states[operation.state]}`,
    detail: toolOperationActive(operation)
      ? [
          stages[operation.stage],
          operation.total > 0
            ? `${formatModelBytes(operation.bytes)} / ${formatModelBytes(operation.total)}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : operation.error
        ? (errors[operation.error] ??
          t(
            "请刷新并核对版本、磁盘空间和安装来源，再决定下一步。",
            "Refresh and check versions, disk space and the installation source before continuing.",
          ))
        : undefined,
    canCancel:
      (operation.state === "queued" || operation.state === "running") &&
      operation.stage !== "committing",
  };
}
