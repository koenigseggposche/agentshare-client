import { isWindowsPlatform, randomUUID } from "../../lib/utils";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareCommandInput,
  AgentShareResourceBudget,
  EnvironmentId,
} from "@t3tools/contracts";
import {
  formatModelBytes,
  modelManagerEntries,
  modelOperationPresentation,
  modelOperationSubmissionState,
  parseModelBudget,
} from "@t3tools/client-runtime/agentShareModelManager";
import { environmentCatalog } from "../../connection/catalog";
import { desktopLocalBackendId } from "../../connection/desktopLocal";
import { resolveProjectPickerTarget } from "../../wslPaths";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsSection } from "../settings/settingsLayout";

export function AgentShareModelManager({
  environmentId,
  owner,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const query = useEnvironmentQuery(
    agentShareEnvironment.modelManager({ environmentId, input: { owner } }),
  );
  const hardware = useEnvironmentQuery(
    agentShareEnvironment.hardware({ environmentId, input: { owner } }),
  );
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; input: AgentShareCommandInput } | null>(
    null,
  );
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importId, setImportId] = useState("");
  const [importPath, setImportPath] = useState("");
  const [libraryPath, setLibraryPath] = useState("");
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const entry = useAtomValue(environmentCatalog.catalogValueAtom).entries.get(environmentId);
  const primary = entry?.target._tag === "PrimaryConnectionTarget";
  const desktopInstanceId = entry ? desktopLocalBackendId(entry.target) : null;
  const canPickDirectory =
    typeof window !== "undefined" &&
    window.desktopBridge !== undefined &&
    (primary || desktopInstanceId !== null);

  const pickDirectory = (current: string, setPath: (path: string) => void) => {
    const bridge = window.desktopBridge;
    if (!canPickDirectory || pickingDirectory || !bridge) return;
    setPickingDirectory(true);
    setMessage(null);
    void (async () => {
      const wslConfiguration =
        primary && isWindowsPlatform(navigator.platform) ? await bridge.getWslState() : null;
      const targetEnvironmentId = resolveProjectPickerTarget({
        browseEnvironmentId: environmentId,
        primaryEnvironmentId: primary ? environmentId : null,
        desktopInstanceId,
        wslConfiguration,
      });
      if (wslConfiguration?.enabled && wslConfiguration.wslOnly && targetEnvironmentId === null) {
        setMessage(
          t("无法识别执行电脑的 WSL 发行版。", "Could not identify the host WSL distribution."),
        );
        return;
      }
      const selected = await bridge.pickFolder({
        ...(current.trim() ? { initialPath: current.trim() } : {}),
        ...(targetEnvironmentId === null ? {} : { targetEnvironmentId }),
      });
      if (selected === null) return;
      if (targetEnvironmentId?.startsWith("wsl:") && !selected.startsWith("/")) {
        setMessage(
          t(
            "无法将目录转换为执行电脑可用的路径。",
            "The selected folder could not be resolved on the host.",
          ),
        );
        return;
      }
      setPath(selected);
    })()
      .catch(() =>
        setMessage(t("无法打开系统目录选择器。", "Could not open the system folder picker.")),
      )
      .finally(() => setPickingDirectory(false));
  };
  const run = async (input: AgentShareCommandInput) => {
    setPending(true);
    setMessage(null);
    const longOperation = input.operation === "importModel" || input.operation === "moveLibrary";
    if (longOperation) {
      setSubmitted({ id: input.body.id, input });
      setSubmissionUnknown(false);
    }
    const result = await command({ environmentId, input }).catch(() => null);
    query.refresh();
    const outcome = modelOperationSubmissionState(result);
    if (longOperation) setSubmissionUnknown(outcome === "unknown");
    setMessage(
      result?._tag === "Success"
        ? t("操作已接受，请查看下方状态。", "Operation accepted. Check the status below.")
        : outcome === "rejected"
          ? t(
              "请求未被接受，请检查路径、账号和执行电脑状态后重试。",
              "The request was not accepted. Check the path, account and host status before retrying.",
            )
          : t(
              "未能确认操作结果。请刷新状态后再决定是否重试。",
              "The outcome could not be confirmed. Refresh the status before retrying.",
            ),
    );
    setPending(false);
  };
  const data = query.error ? null : query.data;
  const blocked = pending || !allowed || !data;
  const operations = data?.operations;
  const libraryBusy =
    operations?.some((operation) =>
      ["queued", "running", "cancelling"].includes(operation.state),
    ) ?? false;
  const unresolved =
    submissionUnknown &&
    submitted !== null &&
    !operations?.some((operation) => operation.id === submitted.id);
  const libraryBlocked = blocked || operations === undefined || libraryBusy || unresolved;
  const entries = data ? modelManagerEntries(data, language) : [];
  const hw = hardware.error ? null : hardware.data;
  return (
    <SettingsSection
      title={t("执行电脑的本机模型", "Local models on the host")}
      headerAction={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            query.refresh();
            hardware.refresh();
          }}
        >
          {t("刷新状态", "Refresh status")}
        </Button>
      }
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "模型在所选电脑下载和运行，手机可以远程管理。",
            "Models download and run on the selected host. Manage them remotely from your phone.",
          )}
        </p>
        {hw ? (
          <p className="text-sm">
            {hw.os} · {hw.arch} · {hw.version} · RAM {formatModelBytes(hw.ram_bytes)}
            {hw.gpu ? ` · ${hw.gpu}` : ""}
            {hw.vram_bytes ? ` · VRAM ${formatModelBytes(hw.vram_bytes)}` : ""}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert">
            {t(
              "无法读取模型库，请检查执行电脑连接后刷新。",
              "Could not read the model library. Check the host connection and refresh.",
            )}
          </p>
        ) : null}
        {!data && !query.error ? <p>{t("正在读取模型库…", "Loading the model library…")}</p> : null}
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
        {operations === undefined && data ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "更新执行电脑的 Core 后，即可使用可查询的离线导入和模型库搬家。",
              "Update Core on the host to use tracked imports and library moves.",
            )}
          </p>
        ) : null}
        {unresolved && submitted ? (
          <div className="space-y-2">
            <p className="break-all text-sm">
              {t("未确认的操作编号", "Unconfirmed operation ID")}：{submitted.id}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => void run(submitted.input)}
            >
              {t("用同一编号重试提交", "Resubmit with the same ID")}
            </Button>
          </div>
        ) : null}
        {operations?.map((operation) => {
          const item = modelOperationPresentation(operation, language);
          return (
            <div key={operation.id} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-medium">
                {item.title} · {item.status}
              </h3>
              <p className="break-all text-sm">{operation.path}</p>
              <p className="break-all text-xs text-muted-foreground">{operation.id}</p>
              {item.progress ? <p className="text-sm">{item.progress}</p> : null}
              {item.error ? (
                <p role="alert" className="text-sm">
                  {item.error}
                </p>
              ) : null}
              {item.canCancel ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked}
                  onClick={() =>
                    void run({ operation: "cancelModelOperation", target: operation.id })
                  }
                >
                  {t("取消此操作", "Cancel this operation")}
                </Button>
              ) : null}
            </div>
          );
        })}
        <Button
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => void run({ operation: "refreshCatalog" })}
        >
          {t("刷新已签名模型目录", "Refresh signed catalog")}
        </Button>
        {data ? (
          <>
            {!data.catalog_fresh ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "请刷新目录后下载模型；现有安装仍可管理。",
                  "Refresh the catalog to download models. Existing installations remain manageable.",
                )}
              </p>
            ) : null}
            {entries.length === 0 ? (
              <p>
                {t(
                  "尚无模型，先刷新目录或导入离线包。",
                  "No models yet. Refresh the catalog or import an offline bundle.",
                )}
              </p>
            ) : null}
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-2 rounded-lg border p-3">
                <h3 className="font-medium">{entry.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {entry.id} · {entry.details}
                </p>
                {entry.description ? <p className="text-sm">{entry.description}</p> : null}
                <p className="text-sm">{entry.status}</p>
                {entry.activity ? <p className="text-sm">{entry.activity}</p> : null}
                {entry.needsAttention ? (
                  <p role="alert" className="text-sm">
                    {t(
                      "此模型需要处理，请检查安装、运行或分享状态。",
                      "This model needs attention. Check its installation, runtime or sharing status.",
                    )}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {entry.actions.map((action) => (
                    <Button
                      key={action.label}
                      size="sm"
                      variant="outline"
                      disabled={blocked}
                      onClick={() => void run(action.input)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <ResourceBudget
              key={`${data.state.budget.ram_bytes}:${data.state.budget.vram_bytes}:${data.state.budget.max_concurrent}`}
              budget={data.state.budget}
              language={language}
              blocked={blocked}
              run={run}
            />
            <div className="space-y-2">
              <h3 className="font-medium">{t("离线导入", "Offline import")}</h3>
              <label className="block space-y-1 text-sm">
                <span>{t("模型 ID", "Model ID")}</span>
                <Input
                  value={importId}
                  onChange={(event) => setImportId(event.target.value)}
                  disabled={blocked}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>
                  {t(
                    "离线包目录（执行电脑上的绝对路径）",
                    "Bundle directory (absolute path on the host)",
                  )}
                </span>
                <Input
                  value={importPath}
                  onChange={(event) => setImportPath(event.target.value)}
                  disabled={blocked}
                />
              </label>
              {canPickDirectory ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={libraryBlocked || pickingDirectory}
                  onClick={() => pickDirectory(importPath, setImportPath)}
                >
                  {t("选择目录", "Choose folder")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={libraryBlocked || !importId.trim() || !importPath.trim()}
                onClick={() =>
                  void run({
                    operation: "importModel",
                    body: {
                      id: randomUUID(),
                      owner,
                      kind: "import",
                      model_id: importId.trim(),
                      path: importPath.trim(),
                    },
                  })
                }
              >
                {t("校验并导入", "Verify and import")}
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">{t("模型库位置", "Model library location")}</h3>
              <p className="break-all text-sm">{data.library_path}</p>
              <label className="block space-y-1 text-sm">
                <span>
                  {t("新位置（执行电脑上的绝对路径）", "New location (absolute path on the host)")}
                </span>
                <Input
                  value={libraryPath}
                  onChange={(event) => setLibraryPath(event.target.value)}
                  disabled={blocked}
                />
              </label>
              {canPickDirectory ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={libraryBlocked || pickingDirectory}
                  onClick={() => pickDirectory(libraryPath, setLibraryPath)}
                >
                  {t("选择目录", "Choose folder")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={
                  libraryBlocked || !libraryPath.trim() || libraryPath.trim() === data.library_path
                }
                onClick={() =>
                  void run({
                    operation: "moveLibrary",
                    body: { id: randomUUID(), owner, kind: "move", path: libraryPath.trim() },
                  })
                }
              >
                {t("迁移模型库", "Move model library")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function ResourceBudget({
  budget,
  language,
  blocked,
  run,
}: {
  budget: AgentShareResourceBudget;
  language: "zh" | "en";
  blocked: boolean;
  run: (input: AgentShareCommandInput) => Promise<void>;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [ram, setRam] = useState((budget.ram_bytes / 1024 ** 3).toFixed(3));
  const [vram, setVram] = useState(((budget.vram_bytes ?? 0) / 1024 ** 3).toFixed(3));
  const [concurrency, setConcurrency] = useState(String(budget.max_concurrent));
  const parsed = parseModelBudget(ram, vram, concurrency);
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{t("本机模型资源预算", "Local model resource budget")}</h3>
      <p className="text-sm text-muted-foreground">
        {t(
          "限制这台电脑的内存、显存和并发请求，不是消费金额上限。降低预算前可能需要停止驻留模型。",
          "Limits host RAM, VRAM and concurrent requests. This is separate from spending. Stop resident models before reducing their reserved resources.",
        )}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { label: "RAM (GiB)", value: ram, change: setRam },
          { label: "VRAM (GiB)", value: vram, change: setVram },
          {
            label: t("并发（1–8）", "Concurrency (1–8)"),
            value: concurrency,
            change: setConcurrency,
          },
        ].map((field) => (
          <label key={field.label} className="space-y-1 text-sm">
            <span>{field.label}</span>
            <Input
              inputMode="decimal"
              value={field.value}
              disabled={blocked}
              onChange={(event) => field.change(event.target.value)}
            />
          </label>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={blocked || !parsed}
        onClick={() => {
          if (parsed) void run({ operation: "modelBudget", body: parsed });
        }}
      >
        {t("保存资源预算", "Save resource budget")}
      </Button>
    </div>
  );
}
