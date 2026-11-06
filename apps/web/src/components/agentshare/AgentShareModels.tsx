import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  agentShareWorkbenchModels,
  type AgentShareModel,
  type EnvironmentId,
} from "@t3tools/contracts";
import { agentShareEnvironment } from "../../state/agentShare";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { Button } from "../ui/button";
import { SettingsSection, SettingsRow } from "../settings/settingsLayout";

export function AgentShareModels({
  environmentId,
  language,
  owner,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const query = useEnvironmentQuery(
    agentShareEnvironment.models({ environmentId, input: { owner } }),
  );
  const configure = useAtomCommand(agentShareEnvironment.configureModel, { reportFailure: false });
  const canConfigure = useAtomValue(
    agentShareEnvironment.configureModel.permissionAtom(environmentId),
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const add = async (model: AgentShareModel) => {
    setPending(true);
    setFeedback(null);
    try {
      const result = await configure({
        environmentId,
        input: { owner, model },
      });
      setFeedback(
        result._tag === "Success"
          ? t(
              "模型连接已添加，可在新会话中选择。",
              "Model connection added. Choose it in a new thread.",
            )
          : t(
              "连接未能确认添加，请刷新工作台后检查。",
              "The connection could not be confirmed. Refresh the workbench and check its status.",
            ),
      );
    } catch {
      setFeedback(
        t(
          "连接中断，请刷新后检查操作结果。",
          "The connection was interrupted. Refresh to check the outcome.",
        ),
      );
    }
    setPending(false);
  };
  const models = agentShareWorkbenchModels(query.data?.models ?? []);
  return (
    <SettingsSection title={t("会话模型", "Conversation models")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "选择模型及来源，添加到工作台。本机纯文本模型在执行电脑运行；在线任务按所选来源的平台费率计费。",
          "Choose a model and source for the workbench. Local text models run on the execution host; online tasks use the selected source’s platform rates.",
        )}
      </p>
      <Button size="sm" variant="outline" onClick={query.refresh}>
        {t("刷新模型", "Refresh models")}
      </Button>
      {query.error ? (
        <p role="alert">
          {t(
            "暂时无法读取模型目录。请检查执行电脑的账号和连接。",
            "The model catalog could not be loaded. Check this host’s account and connection.",
          )}
        </p>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      {!query.isPending && !query.error && models.length === 0 ? (
        <p>
          {t(
            "暂无会话模型。可以启动本机模型，或登录并开启消费查看社区模型。",
            "No conversation models are listed. Start a local model, or sign in and enable consumption to view community models.",
          )}
        </p>
      ) : null}
      {models.map((entry) => (
        <SettingsRow
          key={[
            entry.model.source,
            entry.model.service,
            entry.model.id,
            entry.model.runtime,
            entry.model.device ?? "",
          ].join(":")}
          title={entry.name}
          description={[
            entry.model.source === "community"
              ? t("社区", "Community")
              : entry.model.source === "owned"
                ? t("我的设备", "My devices")
                : t("本机", "This host"),
            entry.device_name ?? "",
            entry.model.runtime === "text"
              ? t("纯文本，无文件和终端工具", "Text only, without file or terminal tools")
              : entry.model.runtime === "claude"
                ? "Claude Code"
                : "Codex",
            entry.available ? t("可用", "Available") : t("暂不可用", "Unavailable"),
          ]
            .filter(Boolean)
            .join(" · ")}
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={pending || query.error !== null || !canConfigure || !entry.available}
              onClick={() => void add(entry.model)}
            >
              {t("添加到工作台", "Add to workbench")}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}
