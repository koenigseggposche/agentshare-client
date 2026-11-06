import { AgentShareManagedTerminal } from "./AgentShareManagedTerminal";
import { AgentShareTools } from "./AgentShareTools";
import { useNavigation } from "@react-navigation/native";
import { AgentShareSourceControls } from "./AgentShareSourceControls";
import { AgentShareWalletSection } from "./AgentShareWalletSection";
import { AgentSharePersonalAccount } from "./AgentSharePersonalAccount";
import { useState } from "react";
import { Linking } from "react-native";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import * as Schema from "effect/Schema";
import {
  agentShareWorkbenchModels,
  EnvironmentAuthorizationError,
  type AgentShareCommandInput,
  type AgentShareModel,
  type EnvironmentId,
} from "@t3tools/contracts";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { agentShareEnvironment } from "../../state/agentShare";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
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

export function SettingsAgentShareRouteScreen() {
  const navigation = useNavigation();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const language = AsyncResult.isSuccess(preferences)
    ? (preferences.value.uiLanguage ?? "zh")
    : "zh";
  const savePreferences = useAtomSet(updateMobilePreferencesAtom, { mode: "promiseExit" });
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { availableTargets } = useSettingsEnvironmentFilter();
  const connectionStatus = useAtomValue(environmentCatalog.catalogStatusAtom);
  const [selectedId, setSelectedId] = useState<EnvironmentId | null>(null);
  const [panel, setPanel] = useState<"personal" | "host">("personal");
  const target =
    selectedId === null
      ? availableTargets.length === 1
        ? availableTargets[0]
        : undefined
      : availableTargets.find((host) => host.environmentId === selectedId);
  return (
    <SettingsScreen title="AgentShare">
      <ScreenScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <SettingsSection title={t("语言", "Language")}>
          <ListActionRow label="中文" onPress={() => void savePreferences({ uiLanguage: "zh" })} />
          <ListActionRow
            label="English"
            onPress={() => void savePreferences({ uiLanguage: "en" })}
          />
        </SettingsSection>
        <SettingsSection title={t("管理范围", "Manage")}>
          <ListActionRow
            label={t("我的账号", "My account")}
            description={
              panel === "personal"
                ? t("当前选择", "Selected")
                : t(
                    "本设备登录、个人余额与账单",
                    "This device’s sign-in, personal balance and records",
                  )
            }
            onPress={() => setPanel("personal")}
          />
          <ListActionRow
            label={t("执行电脑", "Execution host")}
            description={
              panel === "host"
                ? t("当前选择", "Selected")
                : t(
                    "管理所选电脑的账号、模型、共享与工具",
                    "Manage the selected host’s account, models, sharing and tools",
                  )
            }
            onPress={() => setPanel("host")}
          />
        </SettingsSection>
        {panel === "personal" ? (
          <AgentSharePersonalAccount language={language} />
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
                    ? t("正在读取已保存的连接…", "Reading saved connections…")
                    : connectionStatus === "failed"
                      ? t(
                          "无法读取连接设置，请重新打开客户端后重试。",
                          "Connection settings could not be read. Reopen the client and try again.",
                        )
                      : t("请连接并选择一台执行电脑。", "Connect and choose an execution host.")}
                </Text>
              ) : null}
              {target ? (
                <ListActionRow
                  label={t("管理本机模型", "Manage local models")}
                  description={t(
                    "目录、下载、运行、模型库和资源预算",
                    "Catalog, downloads, runtimes, library and resource limits",
                  )}
                  onPress={() =>
                    navigation.navigate("SettingsAgentShareModels", {
                      environmentId: target.environmentId,
                    })
                  }
                />
              ) : null}
            </SettingsSection>
            {target ? (
              <HostAccount
                key={target.environmentId}
                environmentId={target.environmentId}
                language={language}
              />
            ) : null}
          </>
        )}
      </ScreenScrollView>
    </SettingsScreen>
  );
}

function HostAccount({
  environmentId,
  language,
}: {
  environmentId: EnvironmentId;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [section, setSection] = useState<
    "account" | "wallet" | "models" | "sharing" | "tools" | null
  >(null);
  const sections = [
    ["account", t("账号与消费", "Account and consumption")],
    ["wallet", t("钱包与账单", "Wallet and records")],
    ["models", t("会话模型", "Conversation models")],
    ["sharing", t("模型共享", "Model sharing")],
    ["tools", t("编程工具", "Coding tools")],
  ] as const;
  const state = useEnvironmentQuery(agentShareEnvironment.state({ environmentId, input: {} }));
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const canManage = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [grant, setGrant] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const run = async (input: AgentShareCommandInput) => {
    setPending(true);
    setMessage(null);
    const result = await command({ environmentId, input }).catch(() => null);
    if (result?._tag !== "Success") {
      setMessage(
        t(
          "操作未能确认完成，请刷新状态后检查。",
          "The operation could not be confirmed. Refresh and check its outcome.",
        ),
      );
    } else {
      if (input.operation === "cancelSignIn" || input.operation === "signOut") setGrant(null);
      if (input.operation === "signIn") {
        const decoded = decodeGrant(result.value);
        if (decoded._tag === "Some") {
          if (isSafeGrantUrl(decoded.value.verification_uri)) setGrant(decoded.value);
          else
            setMessage(
              t(
                "登录链接无效，请刷新后重试。",
                "The sign-in link is invalid. Refresh and try again.",
              ),
            );
        }
      }
    }
    setPending(false);
  };
  const status = state.error ? undefined : state.data?.status;
  const blocked = pending || !canManage;
  return (
    <>
      <SettingsSection title={t("主机功能", "Host features")}>
        {section === null ? (
          sections.map(([id, label]) => (
            <ListActionRow
              key={id}
              label={label}
              disabled={!canManage}
              onPress={() => setSection(id)}
            />
          ))
        ) : (
          <ListActionRow
            label={t("返回主机功能", "Back to host features")}
            onPress={() => setSection(null)}
          />
        )}
      </SettingsSection>
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
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
            </>
          ) : null}
        </SettingsSection>
      ) : null}
      {section === "tools" && state.data && !state.error ? (
        <AgentShareManagedTerminal
          key={`terminal:${environmentId}:${state.data.host.owner}`}
          environmentId={environmentId}
          owner={state.data.host.owner}
          supported={state.data.host.features.includes("interactive-cli")}
          language={language}
        />
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
      {section === "models" && state.data && !state.error ? (
        <HostModels
          key={state.data.host.owner}
          environmentId={environmentId}
          owner={state.data.host.owner}
          language={language}
        />
      ) : null}
      {section === "sharing" && status ? (
        <SettingsSection title={t("分享模型", "Share models")}>
          <ListActionRow
            label={t("检查来源", "Check sources")}
            disabled={blocked}
            onPress={() => void run({ operation: "checkSources" })}
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
        </SettingsSection>
      ) : null}
    </>
  );
}

function HostModels({
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const add = async (model: AgentShareModel) => {
    setPending(true);
    setMessage(null);
    const result = await configure({
      environmentId,
      input: { owner, model },
    }).catch(() => null);
    setMessage(
      result?._tag === "Success"
        ? t("模型已添加，可在新会话中选择。", "Model added. Choose it in a new thread.")
        : t(
            "添加未能确认完成，请刷新后检查。",
            "The connection could not be confirmed. Refresh and check its status.",
          ),
    );
    setPending(false);
  };
  return (
    <SettingsSection title={t("会话模型", "Conversation models")}>
      <ListActionRow label={t("刷新模型", "Refresh models")} onPress={query.refresh} />
      {message ? <Text>{message}</Text> : null}
      {query.error ? (
        <Text>{t("暂时无法读取模型目录。", "The model catalog could not be loaded.")}</Text>
      ) : null}
      {agentShareWorkbenchModels(query.data?.models ?? []).map((entry) => (
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
            t("添加到工作台", "Add to workbench"),
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
