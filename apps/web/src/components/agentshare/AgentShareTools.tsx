import { randomUUID } from "../../lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  toolOperationActive,
  toolOperationPresentation,
} from "@t3tools/client-runtime/agentShareTools";
import { modelOperationSubmissionState } from "@t3tools/client-runtime/agentShareModelManager";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareCommandInput,
  AgentShareToolOperationRequest,
  AgentShareToolSelection,
  AgentShareToolStatus,
  EnvironmentId,
} from "@t3tools/contracts";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsSection } from "../settings/settingsLayout";

type ToolName = "codex" | "claude";

export function AgentShareTools({
  environmentId,
  owner,
  supported,
  operationsSupported,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  supported: boolean;
  operationsSupported: boolean;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [open, setOpen] = useState(false);
  const query = useEnvironmentQuery(
    open ? agentShareEnvironment.tools({ environmentId, input: { owner } }) : null,
  );
  const jobs = useEnvironmentQuery(
    open && operationsSupported
      ? agentShareEnvironment.toolOperations({ environmentId, input: { owner } })
      : null,
  );
  const completed = useRef("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Invalidate the external host tool-query cache when a durable Core job completes outside this screen.
  useEffect(() => {
    const signature =
      jobs.data?.operations
        .filter((operation) => !toolOperationActive(operation))
        .map((operation) => operation.id)
        .sort()
        .join(",") ?? "";
    if (signature !== completed.current) {
      completed.current = signature;
      query.refresh();
    }
  }, [jobs.data, query]);
  const [submitted, setSubmitted] = useState<AgentShareToolOperationRequest | null>(null);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (service: ToolName, selection: AgentShareToolSelection) => {
    setPending(true);
    setMessage(null);
    const result = await command({
      environmentId,
      input: { operation: "selectTool", target: service, body: selection },
    }).catch(() => null);
    query.refresh();
    setMessage(
      result?._tag === "Success"
        ? t("选择已提交，请核对当前版本。", "Selection submitted. Check the current version.")
        : t(
            "未能确认切换结果，请刷新状态后检查。",
            "The outcome could not be confirmed. Refresh and check the selection.",
          ),
    );
    setPending(false);
  };
  const runInstallation = async (input: AgentShareCommandInput) => {
    setPending(true);
    setMessage(null);
    if (input.operation === "installTool") {
      setSubmitted(input.body);
      setSubmissionUnknown(false);
    }
    const result = await command({ environmentId, input }).catch(() => null);
    const outcome = modelOperationSubmissionState(result);
    if (input.operation === "installTool") setSubmissionUnknown(outcome === "unknown");
    jobs.refresh();
    setMessage(
      outcome === "accepted"
        ? t(
            "操作已接受，请查看安装记录。安装后需手动选择版本。",
            "Accepted. Check the installation record, then select the version explicitly.",
          )
        : outcome === "rejected"
          ? t(
              "请求未被接受，请检查执行电脑、路径和版本。",
              "The request was rejected. Check the host, path and version.",
            )
          : t(
              "结果暂时无法确认，请刷新记录；重发同一请求不会重复安装。",
              "The outcome is unknown. Refresh the records; resending the same request will not repeat the installation.",
            ),
    );
    setPending(false);
  };
  const operations = jobs.error ? undefined : jobs.data?.operations;
  const unresolved =
    submissionUnknown &&
    submitted !== null &&
    !operations?.some((operation) => operation.id === submitted.id);
  const installBlocked =
    pending || !allowed || !operationsSupported || operations === undefined || unresolved;
  const data = query.error ? null : query.data;
  return (
    <SettingsSection
      title={t("执行电脑的编程工具", "Coding tools on the host")}
      headerAction={
        <Button
          size="sm"
          variant="outline"
          disabled={pending || query.isPending}
          onClick={() => (open ? query.refresh() : setOpen(true))}
        >
          {open ? t("刷新工具", "Refresh tools") : t("管理编程工具", "Manage coding tools")}
        </Button>
      }
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "这里选择所选执行电脑上的 Codex 和 Claude。更改用于后续新任务，正在执行的任务继续使用原进程。",
            "Choose Codex and Claude on the selected host. New tasks use the selection; running tasks keep their current process.",
          )}
        </p>
        {open && !supported ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "请先更新这台执行电脑上的 AgentShare，再切换工具版本。",
              "Update AgentShare on this host before switching tool versions.",
            )}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert">
            {t(
              "暂时无法读取工具状态，请刷新重试。",
              "Tool status is unavailable. Refresh to try again.",
            )}
          </p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {open && operationsSupported ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t(
                "安装会在执行电脑后台继续；保留当前工具选择。离线包须位于执行电脑上，并通过内置校验。",
                "Installation continues on the host and preserves the current selection. Offline bundles must be on the host and pass built-in verification.",
              )}
            </p>
            {jobs.error ? (
              <p role="alert">
                {t(
                  "安装记录暂不可用，请刷新。",
                  "Installation records are unavailable. Refresh to try again.",
                )}
              </p>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => jobs.refresh()}>
              {t("刷新安装记录", "Refresh installation records")}
            </Button>
            {unresolved && submitted ? (
              <Button
                size="sm"
                disabled={pending || !allowed}
                onClick={() => void runInstallation({ operation: "installTool", body: submitted })}
              >
                {t("重发同一安装请求", "Resend the same installation request")}
              </Button>
            ) : null}
            {operations?.slice(0, 6).map((operation) => {
              const view = toolOperationPresentation(operation, language);
              return (
                <div key={operation.id} className="space-y-1 rounded border p-3">
                  <p>{view.label}</p>
                  {view.detail ? <p className="text-sm">{view.detail}</p> : null}
                  {view.canCancel ? (
                    <Button
                      size="sm"
                      disabled={pending || !allowed}
                      onClick={() =>
                        void runInstallation({
                          operation: "cancelToolOperation",
                          target: operation.id,
                          body: { owner },
                        })
                      }
                    >
                      {t("取消安装", "Cancel installation")}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {data
          ? (["codex", "claude"] as const).map((service) => (
              <ToolCard
                key={service}
                service={service}
                status={data[service]}
                owner={owner}
                language={language}
                blocked={pending || query.isPending || !allowed || !supported}
                run={run}
                installBlocked={
                  installBlocked ||
                  Boolean(
                    operations?.some(
                      (operation) =>
                        operation.service === service && toolOperationActive(operation),
                    ),
                  )
                }
                install={(kind, value) =>
                  void runInstallation({
                    operation: "installTool",
                    body:
                      kind === "offline"
                        ? { id: randomUUID(), owner, service, kind, path: value }
                        : {
                            id: randomUUID(),
                            owner,
                            service,
                            kind,
                            ...(value ? { version: value } : {}),
                          },
                  })
                }
              />
            ))
          : null}
      </div>
    </SettingsSection>
  );
}

function ToolCard({
  service,
  status,
  owner,
  language,
  blocked,
  run,
  installBlocked,
  install,
}: {
  service: ToolName;
  status: AgentShareToolStatus;
  owner: string;
  language: "zh" | "en";
  blocked: boolean;
  run: (service: ToolName, selection: AgentShareToolSelection) => Promise<void>;
  installBlocked: boolean;
  install: (kind: "install" | "offline", value: string) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [systemPath, setSystemPath] = useState(status.selection.path ?? "");
  const [version, setVersion] = useState("");
  const [bundle, setBundle] = useState("");
  const name = service === "codex" ? "Codex" : "Claude";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">
        {name} ·{" "}
        {status.installed
          ? status.version || t("版本读取失败", "Version unavailable")
          : t("未安装", "Not installed")}
      </h3>
      {status.path ? (
        <p className="break-all text-xs text-muted-foreground">{status.path}</p>
      ) : null}
      {status.version_error ? (
        <p role="alert">
          {t(
            "当前程序未通过版本检查，请选择可用版本。",
            "The current executable failed its version check. Select a working version.",
          )}
        </p>
      ) : null}
      <p className="text-sm">{t("已安装的独立版本", "Installed managed versions")}</p>
      <div className="flex flex-wrap gap-2">
        {status.versions.map((version) => {
          const active =
            status.selection.source === "managed" && status.selection.version === version;
          return (
            <Button
              key={version}
              size="sm"
              variant={active ? "secondary" : "outline"}
              disabled={blocked || active}
              onClick={() => void run(service, { owner, source: "managed", version })}
            >
              {version}
              {active ? t(" · 当前", " · Current") : ""}
            </Button>
          );
        })}
      </div>
      {status.versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("尚未安装独立版本。", "No managed versions are installed.")}
        </p>
      ) : null}
      <label className="grid gap-2 text-sm">
        <span>
          {t(
            `${name} 系统工具路径（执行电脑上的绝对路径，可留空自动查找）`,
            `${name} system executable (absolute host path; leave empty to detect)`,
          )}
        </span>
        <Input
          value={systemPath}
          disabled={blocked}
          onChange={(event) => setSystemPath(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={blocked}
        onClick={() =>
          void run(service, {
            owner,
            source: "system",
            ...(systemPath.trim() ? { path: systemPath.trim() } : {}),
          })
        }
      >
        {t(`使用系统 ${name}`, `Use system ${name}`)}
      </Button>
      <label className="grid gap-1 text-sm">
        <span>{t("官方版本（留空获取最新版本）", "Official version (empty for latest)")}</span>
        <Input
          value={version}
          disabled={installBlocked}
          onChange={(event) => setVersion(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        disabled={installBlocked}
        onClick={() => install("install", version.trim())}
      >
        {t(`安装 ${name} 官方版本`, `Install official ${name}`)}
      </Button>
      <label className="grid gap-1 text-sm">
        <span>
          {t("离线包目录（执行电脑上的绝对路径）", "Offline bundle directory (absolute host path)")}
        </span>
        <Input
          value={bundle}
          disabled={installBlocked}
          onChange={(event) => setBundle(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={installBlocked || !bundle.trim()}
        onClick={() => install("offline", bundle.trim())}
      >
        {t(`从离线包安装 ${name}`, `Install ${name} from offline bundle`)}
      </Button>
    </div>
  );
}
