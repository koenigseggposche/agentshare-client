import { useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { agentShareWorkbenchModels, type EnvironmentId } from "@t3tools/contracts";
import {
  createManagedTerminalLauncher,
  managedTerminalThreadId,
} from "@t3tools/client-runtime/agentShareTerminal";
import { agentShareEnvironment } from "../../state/agentShare";
import { terminalEnvironment } from "../../state/terminal";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjects, useServerConfigs } from "../../state/entities";
import { randomUUID } from "../../lib/utils";
import { TerminalViewport } from "../ThreadTerminalDrawer";
import { SettingsSection } from "../settings/settingsLayout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function AgentShareManagedTerminal({
  environmentId,
  owner,
  supported,
  visible,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  supported: boolean;
  visible: boolean;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [expanded, setExpanded] = useState(false);
  const [directory, setDirectory] = useState("");
  const [selection, setSelection] = useState("");
  const [active, setActive] = useState<{ terminalId: string; cwd: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const threadId = managedTerminalThreadId(owner);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const config = useServerConfigs().get(environmentId);
  const allowed = useAtomValue(agentShareEnvironment.prepareTerminal.permissionAtom(environmentId));
  const query = useEnvironmentQuery(
    expanded && supported
      ? agentShareEnvironment.models({ environmentId, input: { owner } })
      : null,
  );
  const metadata = useEnvironmentQuery(
    expanded && supported ? terminalEnvironment.metadata({ environmentId, input: null }) : null,
  );
  const models = agentShareWorkbenchModels(query.data?.models ?? []).filter(
    (entry) => entry.available && entry.model.runtime !== "text",
  );
  const sessions = (metadata.data ?? []).filter((entry) => entry.threadId === threadId);
  const open = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const prepare = useAtomCommand(agentShareEnvironment.prepareTerminal, { reportFailure: false });
  const write = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const close = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const [launch] = useState(() => createManagedTerminalLauncher({ open, prepare, write }));
  const start = async () => {
    if (busy.current || !allowed || !supported) return;
    const entry = models.find((entry) => JSON.stringify(entry.model) === selection);
    if (!entry || !directory.trim()) return;
    busy.current = true;
    setPending(true);
    const terminalId = `cli-${randomUUID()}`;
    const cwd = directory.trim();
    setMessage(null);
    const result = await launch({
      environmentId,
      input: { owner, model: entry.model, directory: cwd, threadId, terminalId },
    });
    if (result !== "open-unconfirmed") setActive({ terminalId, cwd });
    setMessage(
      result === "submitted"
        ? t(
            "启动命令已发送。请在终端中继续操作。",
            "Launch command sent. Continue in the terminal.",
          )
        : result === "open-unconfirmed"
          ? t(
              "未能确认终端已打开。请检查执行电脑上的目录及终端权限，或从列表连接已有终端；不会自动重发命令。",
              "Terminal opening could not be confirmed. Check the host directory and terminal permissions, or select an existing terminal; the command will not be resent automatically.",
            )
          : t(
              "无法确认启动结果。请先检查终端；不会自动重发命令。",
              "Launch outcome is unknown. Check the terminal; the command will not be resent automatically.",
            ),
    );
    setPending(false);
    busy.current = false;
  };
  const stop = async () => {
    if (!active || busy.current) return;
    busy.current = true;
    setPending(true);
    const result = await close({
      environmentId,
      input: { threadId, terminalId: active.terminalId },
    }).catch(() => null);
    if (result?._tag === "Success") setActive(null);
    setMessage(
      result?._tag === "Success"
        ? t("终端已停止。", "Terminal stopped.")
        : t(
            "未能确认停止结果，请检查终端状态。",
            "Stop outcome is unknown. Check terminal status.",
          ),
    );
    setPending(false);
    busy.current = false;
  };
  return (
    <SettingsSection title={t("交互式编程终端", "Interactive coding terminal")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "在所选执行电脑上使用 Codex 或 Claude 原生终端。模型来源、登录和计费仍由当前账户管理。离开页面不会停止任务。",
          "Use the native Codex or Claude terminal on this host. The current account manages model access and billing. Leaving this page keeps the task running.",
        )}
      </p>
      {!supported ? (
        <p>
          {t(
            "请更新执行电脑的共享服务以使用此功能。",
            "Update this host’s sharing service to use this feature.",
          )}
        </p>
      ) : (
        <Button variant="outline" onClick={() => setExpanded(!expanded)}>
          {expanded ? t("收起", "Collapse") : t("打开终端面板", "Open terminal panel")}
        </Button>
      )}
      {expanded && supported ? (
        <>
          <label className="grid gap-1">
            {t("模型与来源", "Model and source")}
            <Select
              value={selection || null}
              onValueChange={(value) => setSelection(value ?? "")}
              items={models.map((entry) => ({
                value: JSON.stringify(entry.model),
                label: `${entry.name} · ${entry.model.source} · ${entry.model.runtime}${entry.device_name ? ` · ${entry.device_name}` : ""}`,
              }))}
            >
              <SelectTrigger aria-label={t("模型与来源", "Model and source")}>
                <SelectValue placeholder={t("选择模型", "Choose a model")} />
              </SelectTrigger>
              <SelectPopup>
                {models.map((entry) => (
                  <SelectItem key={JSON.stringify(entry.model)} value={JSON.stringify(entry.model)}>
                    {entry.name} · {entry.model.source} · {entry.model.runtime}
                    {entry.device_name ? ` · ${entry.device_name}` : ""}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("执行电脑上的绝对目录", "Absolute directory on this host")}
            <Input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder={t(
                "例如 /Users/me/git/project 或 C:\\work\\project",
                "For example /Users/me/git/project or C:\\work\\project",
              )}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <Button
                key={project.id}
                variant="outline"
                size="sm"
                onClick={() => setDirectory(project.workspaceRoot)}
              >
                {project.title}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={
                !allowed || pending || !directory.trim() || !selection || query.error !== null
              }
              onClick={() => void start()}
            >
              {pending ? t("处理中…", "Working…") : t("启动新终端", "Start new terminal")}
            </Button>
            <Button variant="outline" onClick={query.refresh}>
              {t("刷新模型", "Refresh models")}
            </Button>
          </div>
          {!allowed ? (
            <p>
              {t(
                "此连接需要管理连接及操作终端权限。",
                "This connection requires access management and terminal operation permissions.",
              )}
            </p>
          ) : null}
          {query.error ? (
            <p role="alert">{t("模型目录暂时不可用。", "The model catalog is unavailable.")}</p>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            {sessions.map((session) => (
              <Button
                key={session.terminalId}
                variant="outline"
                onClick={() => setActive({ terminalId: session.terminalId, cwd: session.cwd })}
              >
                {session.cwd} · {session.status}
              </Button>
            ))}
          </div>
          {active ? (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!allowed || pending}
                  onClick={() => void stop()}
                >
                  {t("停止此终端", "Stop this terminal")}
                </Button>
                <Button variant="outline" onClick={() => setActive(null)}>
                  {t("隐藏终端", "Hide terminal")}
                </Button>
              </div>
              <div className="h-96 min-w-0 overflow-hidden rounded border bg-black">
                <TerminalViewport
                  advancedTypography={false}
                  threadRef={{ environmentId, threadId }}
                  threadId={threadId}
                  terminalId={active.terminalId}
                  terminalLabel="CLI"
                  cwd={active.cwd}
                  onSessionExited={() => {}}
                  visible={visible && expanded}
                  keybindings={config?.keybindings ?? []}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
