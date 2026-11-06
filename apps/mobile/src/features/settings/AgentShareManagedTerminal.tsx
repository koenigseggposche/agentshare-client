import { useRef, useState } from "react";
import { View } from "react-native";
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
import { useProjects } from "../../state/entities";
import { useAttachedTerminalSession } from "../../state/use-terminal-session";
import { uuidv4 } from "../../lib/uuid";
import { TerminalSurface } from "../terminal/NativeTerminalSurface";
import { SettingsSection } from "./components/SettingsSection";
import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";

export function AgentShareManagedTerminal({
  environmentId,
  owner,
  supported,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  supported: boolean;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [expanded, setExpanded] = useState(false);
  const [directory, setDirectory] = useState("");
  const [selection, setSelection] = useState("");
  const [choosingModel, setChoosingModel] = useState(false);
  const [active, setActive] = useState<{ terminalId: string; cwd: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const threadId = managedTerminalThreadId(owner);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
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
  const selectedModel = models.find((entry) => JSON.stringify(entry.model) === selection);
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
    const terminalId = `cli-${uuidv4()}`;
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
  const resize = useAtomCommand(terminalEnvironment.resize, { reportFailure: false });
  const session = useAttachedTerminalSession({
    environmentId,
    terminal:
      active && expanded
        ? { threadId, terminalId: active.terminalId, cwd: active.cwd, resume: true }
        : null,
  });
  return (
    <SettingsSection title={t("交互式编程终端", "Interactive coding terminal")}>
      <Text className="px-5 py-3" textRole="footnote">
        {t(
          "在执行电脑上使用 Codex 或 Claude 原生终端。当前账户管理模型访问与计费；离开页面不会停止任务。",
          "Use the native Codex or Claude terminal on this host. The current account manages model access and billing. Leaving this page keeps the task running.",
        )}
      </Text>
      {!supported ? (
        <Text className="px-5 pb-3">
          {t("请更新执行电脑的共享服务。", "Update this host’s sharing service.")}
        </Text>
      ) : (
        <ListActionRow
          label={
            expanded
              ? t("收起终端面板", "Collapse terminal panel")
              : t("打开终端面板", "Open terminal panel")
          }
          onPress={() => setExpanded(!expanded)}
        />
      )}
      {expanded && supported ? (
        <>
          <ListActionRow
            label={selectedModel?.name ?? t("选择模型与来源", "Choose model and source")}
            description={
              selectedModel
                ? [
                    selectedModel.model.source,
                    selectedModel.model.runtime,
                    selectedModel.device_name,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : t("点击选择 Codex 或 Claude", "Choose Codex or Claude")
            }
            onPress={() => setChoosingModel(!choosingModel)}
          />
          {choosingModel
            ? models.map((entry) => (
                <ListActionRow
                  key={JSON.stringify(entry.model)}
                  label={`${selection === JSON.stringify(entry.model) ? "✓ " : ""}${entry.name}`}
                  description={[entry.model.source, entry.model.runtime, entry.device_name]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => {
                    setSelection(JSON.stringify(entry.model));
                    setChoosingModel(false);
                  }}
                />
              ))
            : null}
          <View className="gap-2 px-5 py-3">
            <Text textRole="footnote">
              {t("执行电脑上的绝对目录", "Absolute directory on this host")}
            </Text>
            <AppTextInput
              accessibilityLabel={t("执行目录", "Working directory")}
              value={directory}
              onChangeText={setDirectory}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!pending}
            />
          </View>
          {projects.map((project) => (
            <ListActionRow
              key={project.id}
              label={project.title}
              description={project.workspaceRoot}
              onPress={() => setDirectory(project.workspaceRoot)}
            />
          ))}
          <ListActionRow
            label={t("启动新终端", "Start new terminal")}
            loading={pending}
            disabled={!allowed || !directory.trim() || !selection || query.error !== null}
            onPress={() => void start()}
          />
          <ListActionRow label={t("刷新模型", "Refresh models")} onPress={query.refresh} />
          {!allowed ? (
            <Text className="px-5 py-3">
              {t(
                "此连接需要管理连接及操作终端权限。",
                "This connection requires access management and terminal operation permissions.",
              )}
            </Text>
          ) : null}
          {query.error ? (
            <Text className="px-5 py-3">
              {t("模型目录暂时不可用。", "The model catalog is unavailable.")}
            </Text>
          ) : null}
          {message ? (
            <Text className="px-5 py-3" accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
          {sessions.map((item) => (
            <ListActionRow
              key={item.terminalId}
              label={item.cwd}
              description={item.status}
              onPress={() => setActive({ terminalId: item.terminalId, cwd: item.cwd })}
            />
          ))}
          {active ? (
            <>
              <ListActionRow
                label={t("停止此终端", "Stop this terminal")}
                disabled={!allowed || pending}
                onPress={() => void stop()}
              />
              <ListActionRow
                label={t("隐藏终端", "Hide terminal")}
                onPress={() => setActive(null)}
              />
              {session.error ? (
                <Text className="px-5 py-3">
                  {t(
                    "终端连接暂时不可用，请检查执行电脑。",
                    "Terminal connection is unavailable. Check the host.",
                  )}
                </Text>
              ) : null}
              <View style={{ height: 420 }}>
                <TerminalSurface
                  style={{ flex: 1 }}
                  terminalKey={JSON.stringify([environmentId, threadId, active.terminalId])}
                  buffer={session.buffer}
                  output={session.output}
                  isRunning={session.status === "running"}
                  readOnly={!allowed}
                  onInput={(data) => {
                    if (allowed)
                      void write({
                        environmentId,
                        input: { threadId, terminalId: active.terminalId, data },
                      });
                  }}
                  onResize={({ cols, rows }) => {
                    if (allowed)
                      void resize({
                        environmentId,
                        input: { threadId, terminalId: active.terminalId, cols, rows },
                      });
                  }}
                />
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
