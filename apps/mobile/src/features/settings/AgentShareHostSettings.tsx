import { SettingsDisclosure } from "./components/SettingsDisclosure";
import { AgentShareLocalSharing } from "./AgentShareLocalSharing";
import { AgentShareModelManager } from "./AgentShareModelManager";
import { AgentShareTools } from "./AgentShareTools";
import { AgentShareSourceControls } from "./AgentShareSourceControls";
import { AgentShareWalletSection } from "./AgentShareWalletSection";
import { AgentSharePersonalAccount } from "./AgentSharePersonalAccount";
import { useState } from "react";
import { Linking } from "react-native";

import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import * as Schema from "effect/Schema";
import {
  EnvironmentAuthorizationError,
  type AgentShareCommandInput,
  type EnvironmentId,
} from "@t3tools/contracts";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { agentShareEnvironment } from "../../state/agentShare";
import { mobilePreferencesAtom } from "../../state/preferences";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { environmentCatalog } from "../../connection/catalog";

const isAuthorizationError = Schema.is(EnvironmentAuthorizationError);
const decodeGrant = Schema.decodeUnknownOption(
  Schema.Struct({ user_code: Schema.String, verification_uri: Schema.String }),
);

function isSafeGrantUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

type HostSection = "account" | "wallet" | "library" | "sharing" | "tools";

export function SettingsAccountRouteScreen() {
  return <HostSettingsScreen section="account" />;
}
export function SettingsWalletRouteScreen() {
  return <HostSettingsScreen section="wallet" />;
}
export function SettingsLocalModelsRouteScreen() {
  return <HostSettingsScreen section="library" />;
}
export function SettingsModelSharingRouteScreen() {
  return <HostSettingsScreen section="sharing" />;
}
export function SettingsCodingToolsRouteScreen() {
  return <HostSettingsScreen section="tools" />;
}

function HostSettingsScreen({ section }: { section: HostSection }) {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const language = AsyncResult.isSuccess(preferences)
    ? (preferences.value.uiLanguage ?? "zh")
    : "zh";
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { availableTargets, selectedTargets } = useSettingsEnvironmentFilter();
  const connectionStatus = useAtomValue(environmentCatalog.catalogStatusAtom);
  const [selectedId, setSelectedId] = useState<EnvironmentId | null>(null);
  const [personal, setPersonal] = useState(true);
  const accountPage = section === "account" || section === "wallet";
  const target =
    selectedId === null
      ? selectedTargets.length === 1
        ? selectedTargets[0]
        : availableTargets.length === 1
          ? availableTargets[0]
          : undefined
      : availableTargets.find((host) => host.environmentId === selectedId);
  const headings = {
    account: t("账号与安全", "Account and security"),
    wallet: t("钱包与账单", "Wallet and records"),
    library: t("本地模型", "Local models"),
    sharing: t("模型分享", "Model sharing"),
    tools: t("编程工具", "Coding tools"),
  };
  return (
    <SettingsScreen title={headings[section]}>
      <ScreenScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {accountPage ? (
          <SettingsSection title={t("账号范围", "Account scope")}>
            <ListActionRow
              label={personal ? t("我的账号", "My account") : t("执行电脑", "Execution host")}
              description={
                personal
                  ? t(
                      "独立于执行电脑的登录与连接。",
                      "Independent of execution hosts and their connections.",
                    )
                  : t(
                      "操作所选电脑登录的账号。",
                      "Manage the account signed in on the selected host.",
                    )
              }
              onPress={() => setPersonal(!personal)}
            />
          </SettingsSection>
        ) : null}
        {accountPage && personal ? (
          <AgentSharePersonalAccount section={section} language={language} />
        ) : (
          <>
            <SettingsSection title={t("执行电脑", "Execution host")}>
              {availableTargets.map((host) => (
                <ListActionRow
                  key={host.environmentId}
                  label={host.label}
                  description={
                    target?.environmentId === host.environmentId
                      ? t("当前选择", "Selected")
                      : undefined
                  }
                  onPress={() => setSelectedId(host.environmentId)}
                />
              ))}
              {!target ? (
                <Text>
                  {connectionStatus === "loading"
                    ? t("正在读取连接…", "Loading connections…")
                    : t("请选择一台已连接的执行电脑。", "Choose a connected host.")}
                </Text>
              ) : null}
            </SettingsSection>
            {target ? (
              <HostFeature
                key={`${target.environmentId}:${section}`}
                environmentId={target.environmentId}
                language={language}
                section={section}
              />
            ) : null}
          </>
        )}
      </ScreenScrollView>
    </SettingsScreen>
  );
}

function HostFeature({
  environmentId,
  language,
  section,
}: {
  environmentId: EnvironmentId;
  language: "zh" | "en";
  section: HostSection;
}) {
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  return (
    <HostFeatureDetails
      key={state.data?.host.owner ?? ""}
      environmentId={environmentId}
      language={language}
      section={section}
    />
  );
}

function HostFeatureDetails({
  environmentId,
  language,
  section,
}: {
  environmentId: EnvironmentId;
  language: "zh" | "en";
  section: HostSection;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const canManage = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ zh: string; en: string } | null>(null);
  const [grant, setGrant] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const run = async (input: AgentShareCommandInput) => {
    setPending(true);
    setMessage(null);
    const result = await command({ environmentId, input }).catch(() => null);
    if (result?._tag !== "Success") {
      setMessage({
        zh: "操作未能确认完成，请刷新状态后检查。",
        en: "The operation could not be confirmed. Refresh and check its outcome.",
      });
    } else {
      if (input.operation === "cancelSignIn" || input.operation === "signOut") setGrant(null);
      if (input.operation === "signIn") {
        const decoded = decodeGrant(result.value);
        if (decoded._tag === "Some") {
          if (isSafeGrantUrl(decoded.value.verification_uri)) setGrant(decoded.value);
          else
            setMessage({
              zh: "登录链接无效，请刷新后重试。",
              en: "The sign-in link is invalid. Refresh and try again.",
            });
        }
      }
    }
    setPending(false);
  };
  const status = state.error ? undefined : state.data?.status;
  const blocked = pending || !canManage;
  return (
    <>
      {message ? <Text accessibilityRole="alert">{message[language]}</Text> : null}
      {state.error ? (
        <Text>
          {isAuthorizationError(state.failure)
            ? t(
                "此连接没有管理执行电脑的权限，请在电脑端的连接设置中授权。",
                "This connection cannot manage the host. Grant access in the host’s connection settings.",
              )
            : t(
                "无法读取这台执行电脑的 AgentShare 状态。",
                "AgentShare on this host could not be reached.",
              )}
        </Text>
      ) : null}
      {section !== "account" && state.error ? (
        <ListActionRow label={t("重试", "Retry")} onPress={state.refresh} />
      ) : null}
      {!state.data && state.isPending ? (
        <Text>{t("正在连接执行电脑…", "Connecting to the host…")}</Text>
      ) : null}
      {section === "wallet" && status && !status.paired ? (
        <Text>
          {t(
            "请先在账号与安全中登录，再查看钱包与账单。",
            "Sign in under Account and security to view your wallet and records.",
          )}
        </Text>
      ) : null}
      {section === "account" ? (
        <SettingsSection title={t("执行电脑账号", "Host account")}>
          <ListActionRow label={t("刷新状态", "Refresh status")} onPress={state.refresh} />
          {status ? (
            <>
              <ListActionRow
                label={
                  status.paired
                    ? t("退出登录", "Sign out")
                    : t("登录 AgentShare", "Sign in to AgentShare")
                }
                disabled={blocked}
                onPress={() => void run({ operation: status.paired ? "signOut" : "signIn" })}
              />
              {!status.paired && grant && status.pair?.user_code === grant.user_code ? (
                <>
                  <Text>
                    {t("核对设备码：", "Verify the device code:")} {grant.user_code}
                  </Text>
                  <ListActionRow
                    label={t("打开登录页面", "Open sign-in page")}
                    onPress={() => void Linking.openURL(grant.verification_uri)}
                  />
                  <ListActionRow
                    label={t("取消登录", "Cancel sign-in")}
                    disabled={blocked}
                    onPress={() => void run({ operation: "cancelSignIn" })}
                  />
                </>
              ) : null}
              <SettingsDisclosure title={t("高级：消费授权", "Advanced: spending authorization")}>
                <ListActionRow
                  label={
                    status.consumer.status === "active"
                      ? t("关闭消费", "Disable consumption")
                      : t("开启消费", "Enable consumption")
                  }
                  description={t(
                    "模型推理按所选来源计费。",
                    "Model inference is billed by the selected source.",
                  )}
                  disabled={blocked || !status.paired}
                  onPress={() =>
                    void run({
                      operation: "consumer",
                      body: { enabled: status.consumer.status !== "active" },
                    })
                  }
                />
              </SettingsDisclosure>
            </>
          ) : null}
        </SettingsSection>
      ) : null}
      {section === "tools" && state.data && !state.error ? (
        <AgentShareTools
          key={`tools:${environmentId}:${state.data.host.owner}`}
          environmentId={environmentId}
          owner={state.data.host.owner}
          supported={state.data.host.features.includes("tool-selection")}
          operationsSupported={state.data.host.features.includes("tool-operations")}
          language={language}
        />
      ) : null}
      {section === "wallet" && state.data && !state.error && status?.paired ? (
        <AgentShareWalletSection
          key={`wallet:${environmentId}:${state.data.host.owner}`}
          environmentId={environmentId}
          owner={state.data.host.owner}
          language={language}
        />
      ) : null}
      {section === "library" && state.data && !state.error ? (
        <AgentShareModelManager
          key={`${environmentId}:${state.data.host.owner}`}
          environmentId={environmentId}
          owner={state.data.host.owner}
          language={language}
        />
      ) : null}
      {section === "account" && state.data && !state.error && status?.paired ? (
        <AgentShareWalletSection
          key={`devices:${environmentId}:${state.data.host.owner}`}
          environmentId={environmentId}
          owner={state.data.host.owner}
          language={language}
          mode="devices"
        />
      ) : null}
      {section === "sharing" && status ? (
        <SettingsSection title={t("分享模型", "Share models")}>
          <ListActionRow
            label={t("检查来源", "Check sources")}
            disabled={blocked}
            onPress={() => void run({ operation: "checkSources" })}
          />
          <ListActionRow
            label={
              status.autostart
                ? t("关闭共享服务开机启动", "Disable sharing service at login")
                : t("开机后运行共享服务", "Start sharing service at login")
            }
            disabled={blocked}
            onPress={() =>
              void run({ operation: "autostart", body: { enabled: !status.autostart } })
            }
          />
          {status.sources.map((source) => (
            <AgentShareSourceControls
              key={`${state.data?.host.owner}:${source.key}`}
              source={source}
              language={language}
              blocked={blocked || !status.paired}
              run={run}
            />
          ))}
          {state.data && !state.error && status.paired ? (
            <AgentShareLocalSharing
              key={`${environmentId}:${state.data.host.owner}`}
              environmentId={environmentId}
              owner={state.data.host.owner}
              language={language}
            />
          ) : null}
        </SettingsSection>
      ) : null}
    </>
  );
}
