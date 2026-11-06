import { AgentShareSourceControls } from "./AgentShareSourceControls";
import { AgentShareWallet } from "./AgentShareWallet";
import { AgentShareModelManager } from "./AgentShareModelManager";
import { AgentShareModels } from "./AgentShareModels";
import { AgentShareManagedTerminal } from "./AgentShareManagedTerminal";
import { AgentShareTools } from "./AgentShareTools";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import * as Schema from "effect/Schema";
import { EnvironmentAuthorizationError, type AgentShareCommandInput } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { useSettingsScope } from "../settings/SettingsScopeContext";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { environmentCatalog } from "../../connection/catalog";

const decodeSignIn = Schema.decodeUnknownOption(
  Schema.Struct({
    user_code: Schema.String,
    verification_uri: Schema.String,
  }),
);
const isAuthorizationError = Schema.is(EnvironmentAuthorizationError);
const cannotManage = Atom.make(false);

export function AgentShareSettings() {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { environment } = useSettingsScope();
  const connectionStatus = useAtomValue(environmentCatalog.catalogStatusAtom);
  const environmentId = environment?.environmentId ?? null;
  const state = useEnvironmentQuery(
    environmentId === null ? null : agentShareEnvironment.state({ environmentId, input: {} }),
  );
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [section, setSection] = useState<
    "account" | "wallet" | "models" | "library" | "sharing" | "tools"
  >("account");
  const sections = [
    ["account", t("账号与消费", "Account and consumption")],
    ["wallet", t("钱包与设备", "Wallet and devices")],
    ["models", t("会话模型", "Conversation models")],
    ["library", t("本机模型", "Local models")],
    ["sharing", t("模型共享", "Model sharing")],
    ["tools", t("编程工具", "Coding tools")],
  ] as const;
  const [signIn, setSignIn] = useState<{ user_code: string; verification_uri: string } | null>(
    null,
  );
  const run = async (input: AgentShareCommandInput) => {
    if (environmentId === null) return;
    setPending(true);
    setActionError(null);
    try {
      const result = await command({ environmentId, input });
      if (result._tag === "Success" && input.operation === "signIn") {
        const grant = decodeSignIn(result.value);
        if (grant._tag === "Some") {
          try {
            const link = new URL(grant.value.verification_uri);
            if (link.protocol === "https:" && !link.username && !link.password)
              setSignIn(grant.value);
            else
              setActionError(
                t(
                  "登录链接无效，请刷新后重试。",
                  "The sign-in link is invalid. Refresh and try again.",
                ),
              );
          } catch {
            setActionError(
              t(
                "登录链接无效，请刷新后重试。",
                "The sign-in link is invalid. Refresh and try again.",
              ),
            );
          }
        }
      }
      if (result._tag === "Failure")
        setActionError(
          t(
            "操作未能确认完成。请先刷新状态，确认结果后再操作。",
            "The operation could not be confirmed. Refresh the status and check its outcome before trying again.",
          ),
        );
      if (
        result._tag === "Success" &&
        (input.operation === "cancelSignIn" || input.operation === "signOut")
      )
        setSignIn(null);
    } catch {
      setActionError(
        t(
          "连接中断，请刷新后检查操作结果。",
          "The connection was interrupted. Refresh to check the outcome.",
        ),
      );
    }
    setPending(false);
  };
  const status = state.data?.status;
  const canManage = useAtomValue(
    environmentId === null
      ? cannotManage
      : agentShareEnvironment.command.permissionAtom(environmentId),
  );
  const blocked = pending || !canManage || state.error !== null;
  return (
    <SettingsPageContainer>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">AgentShare</h1>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={language === "zh" ? "secondary" : "ghost"}
            onClick={() => void updateClientSettings({ uiLanguage: "zh" })}
          >
            中文
          </Button>
          <Button
            size="sm"
            variant={language === "en" ? "secondary" : "ghost"}
            onClick={() => void updateClientSettings({ uiLanguage: "en" })}
          >
            English
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          "管理所选执行电脑的账号、模型与共享。",
          "Manage the selected host’s account, models and sharing.",
        )}
      </p>
      {environmentId === null ? (
        <p role="status">
          {connectionStatus === "loading"
            ? t("正在读取已保存的连接…", "Reading saved connections…")
            : connectionStatus === "failed"
              ? t(
                  "无法读取连接设置，请重新打开客户端后重试。",
                  "Connection settings could not be read. Reopen the client and try again.",
                )
              : t("请先选择一台已连接的执行电脑。", "Choose a connected host to continue.")}
        </p>
      ) : null}
      {environmentId !== null && connectionStatus !== "ready" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {connectionStatus === "loading"
            ? t(
                "本机工作台已可用，已保存的远程连接仍在读取中。",
                "The local workbench is available. Saved remote connections are still loading.",
              )
            : t(
                "本机工作台已可用，但保存的连接未能读取。原有资料已保留，请重新打开客户端后重试。",
                "The local workbench is available, but saved connections could not be read. Existing data is preserved. Reopen the client to try again.",
              )}
        </p>
      ) : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {state.error ? (
        <div role="alert" className="space-y-2">
          <p>
            {isAuthorizationError(state.failure)
              ? t(
                  "此连接没有管理执行电脑的权限，请在电脑端的连接设置中授权。",
                  "This connection cannot manage the host. Grant access in the host’s connection settings.",
                )
              : t(
                  "暂时无法连接这台电脑上的 AgentShare。",
                  "AgentShare on this host could not be reached.",
                )}
          </p>
          <Button size="sm" variant="outline" onClick={state.refresh}>
            {t("重试", "Retry")}
          </Button>
        </div>
      ) : null}
      {status ? (
        <>
          <nav aria-label={t("执行电脑功能", "Host features")} className="flex flex-wrap gap-2">
            {sections.map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={section === id ? "secondary" : "outline"}
                aria-pressed={section === id}
                onClick={() => setSection(id)}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div hidden={section !== "account"}>
            <SettingsSection title={t("账号与执行电脑", "Account and host")}>
              <SettingsRow
                title={status.name || environment?.label}
                description={t(
                  "这里的操作作用于这台执行电脑。",
                  "Actions here apply to this host.",
                )}
                control={
                  <Button size="sm" variant="outline" disabled={pending} onClick={state.refresh}>
                    {t("刷新", "Refresh")}
                  </Button>
                }
              />
              <SettingsRow
                title={
                  status.paired
                    ? t("已登录 AgentShare", "Signed in to AgentShare")
                    : t("登录 AgentShare", "Sign in to AgentShare")
                }
                control={
                  <Button
                    size="sm"
                    variant={status.paired ? "outline" : "default"}
                    disabled={blocked}
                    onClick={() => void run({ operation: status.paired ? "signOut" : "signIn" })}
                  >
                    {status.paired ? t("退出登录", "Sign out") : t("登录", "Sign in")}
                  </Button>
                }
              />
              {!status.paired && signIn && status.pair?.user_code === signIn.user_code ? (
                <div className="space-y-3 p-4">
                  <p>
                    {t(
                      "在浏览器登录并批准设备，核对设备码：",
                      "Sign in in your browser and approve this device using code:",
                    )}{" "}
                    <strong>{signIn.user_code}</strong>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      render={
                        <a
                          href={signIn.verification_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      {t("打开登录页面", "Open sign-in page")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void run({ operation: "cancelSignIn" })}
                    >
                      {t("取消登录", "Cancel sign-in")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {status.pair_error ? (
                <p role="alert" className="p-4 text-sm">
                  {t("登录未完成，请重新开始。", "Sign-in did not finish. Please try again.")}
                </p>
              ) : null}
              <SettingsRow
                title={t("使用社区模型", "Use community models")}
                description={t(
                  "与共享独立控制；模型推理按平台账单计费。",
                  "Independent of sharing. Inference uses platform billing.",
                )}
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked || !status.paired}
                    onClick={() =>
                      void run({
                        operation: "consumer",
                        body: { enabled: status.consumer.status !== "active" },
                      })
                    }
                  >
                    {status.consumer.status === "active"
                      ? t("关闭消费", "Disable consumption")
                      : t("开启消费", "Enable consumption")}
                  </Button>
                }
              />
              <SettingsRow
                title={t("开机后运行共享服务", "Run sharing service at sign-in")}
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked}
                    onClick={() =>
                      void run({ operation: "autostart", body: { enabled: !status.autostart } })
                    }
                  >
                    {status.autostart ? t("关闭", "Disable") : t("开启", "Enable")}
                  </Button>
                }
              />
            </SettingsSection>
          </div>
          <div hidden={section !== "tools"}>
            {environmentId !== null && state.data && !state.error ? (
              <AgentShareManagedTerminal
                key={`terminal:${environmentId}:${state.data.host.owner}`}
                environmentId={environmentId}
                owner={state.data.host.owner}
                supported={state.data.host.features.includes("interactive-cli")}
                visible={section === "tools"}
                language={language}
              />
            ) : null}
            {environmentId !== null && state.data && !state.error ? (
              <AgentShareTools
                key={`tools:${environmentId}:${state.data.host.owner}`}
                environmentId={environmentId}
                owner={state.data.host.owner}
                supported={state.data.host.features.includes("tool-selection")}
                operationsSupported={state.data.host.features.includes("tool-operations")}
                language={language}
              />
            ) : null}
          </div>
          <div hidden={section !== "wallet"}>
            {!status.paired ? (
              <p>
                {t(
                  "请先在账号与消费中登录，再查看钱包和设备。",
                  "Sign in under Account and consumption to view your wallet and devices.",
                )}
              </p>
            ) : null}
            {environmentId !== null && state.data && !state.error && status.paired ? (
              <AgentShareWallet
                key={`wallet:${environmentId}:${state.data.host.owner}`}
                environmentId={environmentId}
                owner={state.data.host.owner}
                language={language}
              />
            ) : null}
          </div>
          <div hidden={section !== "models"}>
            {environmentId !== null ? (
              <AgentShareModels
                key={`${environmentId}:${state.data?.host.owner}`}
                environmentId={environmentId}
                owner={state.data?.host.owner ?? "offline"}
                language={language}
              />
            ) : null}
          </div>
          <div hidden={section !== "library"}>
            {environmentId !== null && state.data && !state.error ? (
              <AgentShareModelManager
                key={`library:${environmentId}:${state.data.host.owner}`}
                environmentId={environmentId}
                owner={state.data.host.owner}
                language={language}
              />
            ) : null}
          </div>
          <div hidden={section !== "sharing"}>
            <SettingsSection
              title={t("分享模型能力", "Share model access")}
              headerAction={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => void run({ operation: "checkSources" })}
                >
                  {t("检查来源", "Check sources")}
                </Button>
              }
            >
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
          </div>
        </>
      ) : state.isPending ? (
        <p>{t("正在连接执行电脑…", "Connecting to the host…")}</p>
      ) : null}
    </SettingsPageContainer>
  );
}
