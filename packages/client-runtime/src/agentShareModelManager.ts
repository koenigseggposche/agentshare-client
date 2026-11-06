import { AgentShareCoreError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Cause from "effect/Cause";
import type {
  AgentShareCommandInput,
  AgentShareModelOperation,
  AgentShareModelManager,
  AgentShareResourceBudget,
} from "@t3tools/contracts";

type Language = "zh" | "en";
export function formatModelBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : 1;
  return `${(bytes / 1024 ** unit).toFixed(1)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}
export function modelManagerEntries(data: AgentShareModelManager, language: Language) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const catalog = new Map((data.catalog.models ?? []).map((model) => [model.id, model]));
  const ids = new Set([
    ...catalog.keys(),
    ...Object.keys(data.state.installations ?? {}),
    ...Object.keys(data.state.tasks ?? {}),
  ]);
  return Array.from(ids, (id) => {
    const installed = data.state.installations?.[id];
    const model = catalog.get(id) ?? installed?.model;
    const task = data.state.tasks?.[id];
    const runtime = data.state.runtimes?.[id];
    const access = data.remote_access?.[id];
    const busy = task?.state === "downloading" || task?.state === "installing";
    const running = runtime !== undefined && runtime.state !== "stopped";
    const actions: Array<{ label: string; input: AgentShareCommandInput }> = [];
    const add = (label: string, input: AgentShareCommandInput) => actions.push({ label, input });
    if (busy) {
      add(t("暂停下载", "Pause download"), { operation: "pauseDownload", target: id });
      add(t("取消下载", "Cancel download"), { operation: "cancelDownload", target: id });
    } else if (!installed && data.catalog_fresh && model) {
      add(
        task && ["paused", "failed", "cancelled"].includes(task.state)
          ? t("继续下载", "Resume download")
          : t("下载模型", "Download model"),
        {
          operation: task ? "resumeDownload" : "installModel",
          ...(task ? { target: id } : { body: { id } }),
        },
      );
    }
    if (task?.state === "paused")
      add(t("取消下载", "Cancel download"), { operation: "cancelDownload", target: id });
    if (installed && !busy) {
      if (!running) add(t("启动模型", "Start model"), { operation: "startModel", target: id });
      else if (runtime.state !== "draining")
        add(t("停止模型", "Stop model"), { operation: "stopModel", target: id });
      if (!running)
        add(t("删除模型文件", "Delete model files"), { operation: "removeModel", target: id });
      if (model?.share_allowed && runtime?.state === "ready" && !access?.draining) {
        for (const [visibility, label] of [
          ["off", t("关闭模型分享", "Turn sharing off")],
          ["owner_only", t("仅自己的设备可用", "Share with my devices")],
          ["community", t("分享到社区", "Share with the community")],
        ] as const) {
          if ((access?.visibility ?? "off") !== visibility)
            add(label, { operation: "modelSharing", body: { id, visibility } });
        }
      }
    }
    const states: Record<string, string> = {
      downloading: t("下载中", "Downloading"),
      installing: t("安装中", "Installing"),
      paused: t("下载已暂停", "Download paused"),
      failed: t("安装失败", "Installation failed"),
      cancelled: t("下载已取消", "Download cancelled"),
      complete: t("已安装", "Installed"),
      ready: t("运行中", "Running"),
      stopped: t("已停止", "Stopped"),
      starting: t("启动中", "Starting"),
      draining: t("正在完成请求", "Finishing requests"),
    };
    const size = model
      ? model.artifact.bytes +
        (model.shards ?? []).reduce((sum, shard) => sum + shard.artifact.bytes, 0)
      : undefined;
    const visibility =
      access?.visibility === "community"
        ? t("社区分享", "Community sharing")
        : access?.visibility === "owner_only"
          ? t("仅自己", "My devices only")
          : t("未分享", "Sharing off");
    return {
      id,
      name: model?.name ?? id,
      description: model?.description ?? "",
      details: [
        model?.license,
        size === undefined ? undefined : formatModelBytes(size),
        model
          ? `${t("所需内存", "Required RAM")} ${formatModelBytes(model.minimum_ram_bytes)}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      status: [
        states[runtime?.state ?? task?.state ?? ""] ??
          (installed ? t("已安装", "Installed") : t("未安装", "Not installed")),
        busy || task?.state === "paused"
          ? `${formatModelBytes(task?.bytes ?? 0)} / ${formatModelBytes(task?.total ?? 0)}`
          : undefined,
        installed ? visibility : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      activity: running
        ? `${t("执行中", "Active")} ${runtime.active_requests} · ${t("排队", "Queued")} ${runtime.queued} · RAM ${formatModelBytes(runtime.reserved_ram_bytes)} · VRAM ${formatModelBytes(runtime.reserved_vram_bytes ?? 0)}`
        : undefined,
      needsAttention: Boolean(task?.error || runtime?.error || access?.error),
      actions,
    };
  });
}

export function parseModelBudget(
  ramGiB: string,
  vramGiB: string,
  concurrency: string,
): AgentShareResourceBudget | undefined {
  if (
    ![ramGiB, vramGiB].every((value) => /^\d+(?:\.\d{1,3})?$/.test(value)) ||
    !/^[1-8]$/.test(concurrency)
  )
    return;
  const ram = Math.round(Number(ramGiB) * 1024 ** 3);
  const vram = Math.round(Number(vramGiB) * 1024 ** 3);
  if (!Number.isSafeInteger(ram) || !Number.isSafeInteger(vram) || ram < 256 * 1024 ** 2) return;
  return { ram_bytes: ram, vram_bytes: vram, max_concurrent: Number(concurrency) };
}

export function modelOperationPresentation(
  operation: AgentShareModelOperation,
  language: Language,
) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const states = {
    queued: t("等待执行", "Queued"),
    running: t("进行中", "In progress"),
    cancelling: t("正在取消", "Cancelling"),
    succeeded: t("已完成", "Completed"),
    failed: t("失败", "Failed"),
    cancelled: t("已取消", "Cancelled"),
    interrupted: t("已中断，请核对结果", "Interrupted; check the outcome"),
  };
  const stages: Record<string, string> = {
    queued: t("等待执行", "Queued"),
    starting: t("准备中", "Preparing"),
    scanning: t("检查文件", "Scanning files"),
    checking: t("检查已有文件", "Checking existing files"),
    verifying: t("校验文件", "Verifying files"),
    copying: t("复制文件", "Copying files"),
    installing: t("安装运行环境", "Installing runtime"),
    committing: t("切换模型库", "Activating library"),
    cleaning: t("清理原库中未变化的文件", "Removing unchanged old files"),
    completed: t("完成", "Completed"),
  };
  const errors: Record<string, string> = {
    stop_models_and_pause_downloads_before_moving_library: t(
      "请先停止模型并暂停下载。",
      "Stop models and pause downloads first.",
    ),
    choose_a_new_empty_model_library: t(
      "请选择一个尚不存在的新目录。",
      "Choose a new directory that does not exist yet.",
    ),
    insufficient_model_library_disk_space: t(
      "执行电脑的磁盘空间不足。",
      "The host has insufficient disk space.",
    ),
    offline_package_missing_or_invalid_object: t(
      "离线包缺少文件或文件大小不符。",
      "The offline bundle has missing or invalid files.",
    ),
    offline_package_digest_mismatch: t(
      "离线包文件校验失败。",
      "Offline bundle verification failed.",
    ),
    account_owner_changed: t("执行电脑的账号已改变。", "The host account changed."),
  };
  const active =
    operation.state === "queued" ||
    operation.state === "running" ||
    operation.state === "cancelling";
  return {
    title:
      operation.kind === "import"
        ? t("离线导入", "Offline import")
        : t("模型库搬家", "Move model library"),
    status: states[operation.state],
    progress: active
      ? [
          stages[operation.stage] ?? t("处理中", "Working"),
          operation.total > 0
            ? `${formatModelBytes(operation.bytes)} / ${formatModelBytes(operation.total)}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined,
    error: operation.error
      ? (errors[operation.error] ??
        t(
          "请刷新并核对当前模型库和安装状态，再决定下一步。",
          "Refresh and inspect the current library and installation state before continuing.",
        ))
      : undefined,
    canCancel:
      (operation.state === "queued" || operation.state === "running") &&
      operation.stage !== "committing" &&
      operation.stage !== "cleaning",
  };
}

const isCoreError = Schema.is(AgentShareCoreError);
export function modelOperationSubmissionState(
  result:
    | { readonly _tag: "Success" }
    | { readonly _tag: "Failure"; readonly cause: Cause.Cause<unknown> }
    | null,
) {
  if (result?._tag === "Success") return "accepted";
  if (result?._tag === "Failure") {
    const error = Cause.squash(result.cause);
    if (
      isCoreError(error) &&
      (error.category === "denied" ||
        error.category === "invalid-operation" ||
        error.category === "invalid-runtime" ||
        (error.category === "rejected" &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500))
    )
      return "rejected";
  }
  return "unknown";
}
