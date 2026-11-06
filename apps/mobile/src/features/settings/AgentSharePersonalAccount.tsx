import { AgentSharePersonalFunds } from "./AgentShareFunds";
import * as DeviceLogin from "@agentshare/account-client/DeviceLogin";
import * as WalletClient from "@agentshare/account-client/WalletClient";
import {
  AgentShareAccountError,
  type AgentShareWalletReadInput,
  type AgentShareWalletReadResult,
  type AgentShareWalletCommandInput,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import * as Runtime from "../../lib/runtime";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";
import { AgentShareWalletView } from "./AgentShareWalletSection";

const isAccountError = Schema.is(AgentShareAccountError);

function accountErrorCode(error: unknown): string {
  if (!isAccountError(error)) return "unexpected";
  const status = error.status;
  return `${error.category}${Number.isInteger(status) && status! >= 100 && status! <= 599 ? `/${status}` : ""}`;
}

type AccountOperation = "state" | "start" | "check" | "cancel" | "signOut";
const accountOperation = Effect.fn("AgentShareMobile.accountOperation")(function* (
  operation: AccountOperation,
) {
  const login = yield* DeviceLogin.DeviceLogin;
  if (operation === "cancel" || operation === "signOut") {
    yield* login[operation]();
    return yield* login.state();
  }
  return yield* login[operation]();
});
const readPersonalWallet = Effect.fn("AgentShareMobile.readPersonalWallet")(function* (
  input: AgentShareWalletReadInput,
) {
  return yield* (yield* WalletClient.WalletClient).read(input);
});
const commandPersonalWallet = Effect.fn("AgentShareMobile.commandPersonalWallet")(function* (
  input: AgentShareWalletCommandInput,
) {
  return yield* (yield* WalletClient.WalletClient).command(input);
});

export function AgentSharePersonalAccount({ language }: { language: "zh" | "en" }) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [snapshot, setSnapshot] = useState<DeviceLogin.DeviceLoginState>();
  const [error, setError] = useState<string | null>(null);
  const [serviceUrl, setServiceUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(false);
  const run = useCallback(async (operation: AccountOperation) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const result = await Runtime.runtime.runPromiseExit(accountOperation(operation));
    running.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (Exit.isFailure(result)) {
      const cause = Cause.squash(result.cause);
      setError(
        isAccountError(cause)
          ? cause.operation === "credentials" && cause.category === "unavailable"
            ? "secure-storage-unavailable"
            : cause.category
          : "unavailable",
      );
    } else {
      setError(null);
      setServiceUrl(result.value.consoleUrl);
    }
    setSnapshot(Exit.isSuccess(result) ? result.value : undefined);
  }, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Refresh authorization when the native app returns from browser sign-in.
  useEffect(() => {
    mounted.current = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Start the initial keychain and platform lookup when the native screen mounts.
    void run("state");
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run("check");
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [run]);
  const refreshAccount = useCallback(() => {
    void run("state");
  }, [run]);
  const interval = snapshot?.status === "pending" ? snapshot.interval : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Poll only an active native authorization grant while this screen is mounted.
  useEffect(() => {
    if (interval === null || error) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void run("check");
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [interval, error, run]);

  return (
    <>
      <SettingsSection title={t("我的 AgentShare 账号", "My AgentShare account")}>
        <Text className="px-5 py-2" textRole="body">
          {t(
            "此设备独立登录，用于查看个人余额和账单。",
            "Sign in on this device to view your balances and records.",
          )}
        </Text>
        {serviceUrl ? (
          <Text className="px-5 py-2" textRole="footnote">
            {serviceUrl}
          </Text>
        ) : null}
        {error ? (
          <Text className="px-5 py-2" textRole="body" accessibilityRole="alert">
            {error === "secure-storage-unavailable"
              ? t(
                  "无法访问此设备的安全凭据存储，请检查设备解锁状态或系统钥匙串。",
                  "Secure credential storage is unavailable. Check that the device is unlocked and its system keychain is accessible.",
                )
              : error === "invalid-response"
                ? t(
                    "账号服务响应无法识别，请核对服务地址和客户端版本。",
                    "The account response could not be read. Check the service address and client version.",
                  )
                : error === "unavailable"
                  ? t(
                      "无法连接账号服务，请检查网络后刷新。",
                      "The account service could not be reached. Check your connection and refresh.",
                    )
                  : error === "sign-in-required"
                    ? t("登录已失效，请重新登录。", "Your sign-in has expired. Sign in again.")
                    : t(
                        "未能确认操作结果。请刷新检查；若退出时断网，可在控制台设备列表撤销此设备。",
                        "The outcome could not be confirmed. Refresh to check. If sign-out lost connectivity, revoke this device in the Console device list.",
                      )}
          </Text>
        ) : null}
        <ListActionRow
          label={t("刷新个人账号", "Refresh my account")}
          disabled={busy}
          onPress={() => void run("state")}
        />
        {error ? (
          <ListActionRow
            label={t("退出此设备账号", "Sign out on this device")}
            disabled={busy}
            onPress={() => void run("signOut")}
          />
        ) : null}
        {snapshot?.status === "signed-in" ? (
          <>
            <Text className="px-5 py-2" textRole="body">
              {t("此设备已登录", "This device is signed in")}
            </Text>
            <ListActionRow
              label={t("退出此设备账号", "Sign out on this device")}
              disabled={busy}
              onPress={() => void run("signOut")}
            />
          </>
        ) : snapshot?.status === "pending" ? (
          <>
            <Text selectable className="px-5 py-2" textRole="body">
              {t("核对设备码：", "Verify the device code:")} {snapshot.userCode}
            </Text>
            <ListActionRow
              label={t("打开浏览器登录并确认", "Sign in and confirm in browser")}
              onPress={() => void Linking.openURL(snapshot.verificationUrl)}
            />
            <ListActionRow
              label={t("检查登录结果", "Check sign-in")}
              disabled={busy}
              onPress={() => void run("check")}
            />
            <ListActionRow
              label={t("取消此设备登录", "Cancel device sign-in")}
              disabled={busy}
              onPress={() => void run("cancel")}
            />
          </>
        ) : (
          <ListActionRow
            label={t("登录我的账号", "Sign in to my account")}
            disabled={busy}
            onPress={() => void run("start")}
          />
        )}
      </SettingsSection>
      {!error && snapshot?.status === "signed-in" ? (
        <PersonalWallet
          key={`${snapshot.identity.owner}:${snapshot.identity.deviceId}`}
          owner={snapshot.identity.owner}
          language={language}
          onAccountChanged={refreshAccount}
        />
      ) : null}
    </>
  );
}

function PersonalWallet({
  owner,
  language,
  onAccountChanged,
}: {
  owner: string;
  language: "zh" | "en";
  onAccountChanged: () => void;
}) {
  const [selection, setSelection] = useState<AgentShareWalletReadInput>({
    action: "overview",
    owner,
  });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    input: AgentShareWalletReadInput;
    revision: number;
    value?: AgentShareWalletReadResult;
    error: boolean;
    errorCode?: string;
  }>();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Synchronize the selected private wallet view with the platform account service.
  useEffect(() => {
    let active = true;
    void Runtime.runtime.runPromiseExit(readPersonalWallet(selection)).then((exit) => {
      if (active) {
        if (Exit.isFailure(exit)) {
          const cause = Cause.squash(exit.cause);
          if (
            isAccountError(cause) &&
            (cause.category === "sign-in-required" || cause.category === "account-changed")
          )
            onAccountChanged();
        }
        setResult({
          input: selection,
          revision,
          ...(Exit.isSuccess(exit) ? { value: exit.value } : {}),
          error: Exit.isFailure(exit),
          ...(Exit.isFailure(exit)
            ? { errorCode: accountErrorCode(Cause.squash(exit.cause)) }
            : {}),
        });
      }
    });
    return () => {
      active = false;
    };
  }, [selection, revision, onAccountChanged]);
  const current = result?.input === selection && result.revision === revision ? result : undefined;
  const displayed = result?.input === selection && !result.error ? result.value : undefined;
  return (
    <AgentShareWalletView
      funds={
        displayed?.action === "overview" ? (
          <AgentSharePersonalFunds
            key={owner}
            owner={owner}
            language={language}
            overview={displayed.data}
            onChanged={() => setRevision((value) => value + 1)}
            onAccountChanged={onAccountChanged}
          />
        ) : undefined
      }
      personal
      canCommand
      onCommand={async (input) => {
        const exit = await Runtime.runtime.runPromiseExit(commandPersonalWallet(input));
        if (Exit.isFailure(exit)) {
          const cause = Cause.squash(exit.cause);
          if (
            isAccountError(cause) &&
            (cause.category === "sign-in-required" || cause.category === "account-changed")
          )
            onAccountChanged();
        }
        return Exit.isSuccess(exit);
      }}
      owner={owner}
      language={language}
      selection={selection}
      onSelect={setSelection}
      query={{
        data: displayed,
        error: current?.error ?? false,
        errorCode: current?.errorCode,
        isPending: current === undefined,
        refresh: () => setRevision((value) => value + 1),
      }}
    />
  );
}
