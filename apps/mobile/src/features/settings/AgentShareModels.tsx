import { SettingsDisclosure } from "./components/SettingsDisclosure";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  agentShareWorkbenchModels,
  type AgentShareModel,
  type EnvironmentId,
} from "@t3tools/contracts";
import { filterAgentShareModels } from "@t3tools/shared/agentShareModelCatalog";
import {
  modelSourceLabels,
  modelSourceOptions,
  type ModelSourceFilter,
} from "@t3tools/shared/workbenchLabels";
import { View } from "react-native";
import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { Chip } from "../../components/ui/Chip";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";
import { useWorkbenchLanguage } from "../workspace/navigation-tabs";

export function AgentShareModelConnections({ environmentId }: { environmentId: EnvironmentId }) {
  const language = useWorkbenchLanguage();
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  return state.data && !state.error ? (
    <SettingsDisclosure title={language === "zh" ? "浏览并添加模型" : "Browse and add models"}>
      <HostModels
        key={state.data.host.owner}
        environmentId={environmentId}
        owner={state.data.host.owner}
        language={language}
      />
    </SettingsDisclosure>
  ) : null;
}

export function HostModels({
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
    agentShareEnvironment.models({ environmentId, input: { owner } }),
  );
  const configure = useAtomCommand(agentShareEnvironment.configureModel, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.configureModel.permissionAtom(environmentId));
  const [source, setSource] = useState<ModelSourceFilter>("all");
  const [search, setSearch] = useState("");
  const sourceLabels = modelSourceLabels[language];
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ zh: string; en: string } | null>(null);
  const add = async (model: AgentShareModel) => {
    setPending(true);
    setMessage(null);
    const result = await configure({
      environmentId,
      input: { owner, model },
    }).catch(() => null);
    setMessage(
      result?._tag === "Success"
        ? { zh: "模型已添加，可在新会话中选择。", en: "Model added. Choose it in a new thread." }
        : {
            zh: "添加未能确认完成，请刷新后检查。",
            en: "The connection could not be confirmed. Refresh and check its status.",
          },
    );
    setPending(false);
  };
  const models = agentShareWorkbenchModels(query.data?.models ?? []);
  const visibleModels = filterAgentShareModels(models, source, search);
  return (
    <SettingsSection title={t("会话模型", "Conversation models")}>
      <View className="px-4 py-2">
        <AppTextInput
          accessibilityLabel={t("搜索模型或设备", "Search models or devices")}
          placeholder={t("搜索模型或设备", "Search models or devices")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View className="flex-row flex-wrap gap-2 px-4 py-2">
        {modelSourceOptions.map((option) => (
          <Chip
            key={option}
            label={sourceLabels[option]}
            selected={source === option}
            onPress={() => setSource(option)}
          />
        ))}
      </View>
      <ListActionRow label={t("刷新模型", "Refresh models")} onPress={query.refresh} />
      {!allowed ? (
        <Text>{t("此连接没有添加模型的权限。", "This connection cannot add models.")}</Text>
      ) : null}
      {message ? <Text>{message[language]}</Text> : null}
      {query.error ? (
        <Text>{t("暂时无法读取模型目录。", "The model catalog could not be loaded.")}</Text>
      ) : null}
      {!query.isPending && !query.error && visibleModels.length === 0 ? (
        <Text>
          {search.trim() && models.length > 0
            ? t("没有匹配的模型。", "No matching models.")
            : source === "all"
              ? t("暂无会话模型。", "No conversation models are listed.")
              : t("这个来源暂时没有会话模型。", "No conversation models from this source.")}
        </Text>
      ) : null}
      {visibleModels.map((entry) => (
        <ListActionRow
          key={[
            entry.model.source,
            entry.model.service,
            entry.model.id,
            entry.model.runtime,
            entry.model.device ?? "",
          ].join(":")}
          label={entry.name}
          description={[
            sourceLabels[entry.model.source],
            entry.device_name ?? "",
            entry.model.runtime === "text"
              ? t("纯文本，无文件和终端工具", "Text only, without file or terminal tools")
              : entry.model.runtime === "claude"
                ? "Claude Code"
                : "Codex",
            entry.available ? t("添加到工作台", "Add to workbench") : t("暂不可用", "Unavailable"),
          ]
            .filter(Boolean)
            .join(" · ")}
          disabled={pending || !allowed || query.error !== null || !entry.available}
          onPress={() => void add(entry.model)}
        />
      ))}
    </SettingsSection>
  );
}
