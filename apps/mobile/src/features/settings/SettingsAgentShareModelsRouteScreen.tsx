import { useAtomValue } from "@effect/atom-react";
import type { StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { agentShareEnvironment } from "../../state/agentShare";
import { mobilePreferencesAtom } from "../../state/preferences";
import { useEnvironmentQuery } from "../../state/query";
import { AgentShareModelManager } from "./AgentShareModelManager";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";

export function SettingsAgentShareModelsRouteScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const language = AsyncResult.isSuccess(preferences)
    ? (preferences.value.uiLanguage ?? "zh")
    : "zh";
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const environmentId = route.params.environmentId;
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  return (
    <SettingsScreen title={t("本机模型", "Local models")}>
      <ScreenScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <SettingsSection title={t("执行电脑", "Execution host")}>
          <Text className="px-5 py-3" textRole="body">
            {state.data?.status.name ?? t("正在连接…", "Connecting…")}
          </Text>
          {state.error ? (
            <ListActionRow label={t("重新连接", "Reconnect")} onPress={state.refresh} />
          ) : null}
        </SettingsSection>
        {state.data && !state.error ? (
          <AgentShareModelManager
            key={`${environmentId}:${state.data.host.owner}`}
            environmentId={environmentId}
            owner={state.data.host.owner}
            language={language}
          />
        ) : null}
      </ScreenScrollView>
    </SettingsScreen>
  );
}
