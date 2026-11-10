import { Button } from "../../components/ui/Button";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ConnectionTraceId } from "./ConnectionTraceId";
import {
  type EnvironmentConnectionPhase,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";
import { SymbolView } from "../../components/ui/AppSymbol";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";

import { useWorkbenchLanguage } from "../workspace/navigation-tabs";

const resources = {
  terminal: { zh: "终端", en: "terminal" },
  review: { zh: "改动审阅", en: "review" },
  preview: { zh: "文件预览", en: "preview" },
} as const;

function noticeTitle(
  phase: EnvironmentConnectionPhase,
  environment: string,
  language: "zh" | "en",
): string {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  switch (phase) {
    case "offline":
      return t("设备未联网", "You are offline");
    case "connecting":
      return t(`正在连接 ${environment}…`, `Connecting to ${environment}...`);
    case "reconnecting":
      return t(`正在重连 ${environment}…`, `Reconnecting to ${environment}...`);
    case "unsupported":
      return t("客户端版本不受支持", "Client not supported");
    case "error":
      return t(`${environment} 暂时不可用`, `${environment} is unavailable`);
    case "available":
      return t(`${environment} 已断开连接`, `${environment} is disconnected`);
    case "connected":
      return "";
  }
}

function noticeDetail(
  phase: EnvironmentConnectionPhase,
  resourceName: string,
  error: string | null,
  language: "zh" | "en",
): string {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  if (error) {
    return phase === "reconnecting"
      ? t(`应用会自动重试。 ${error}`, `The app will keep retrying automatically. ${error}`)
      : error;
  }

  switch (phase) {
    case "offline":
      return t(
        `仍可查看缓存内容。恢复网络后会加载${resourceName}。`,
        `Cached data remains available. The ${resourceName} will load when your connection returns.`,
      );
    case "connecting":
    case "reconnecting":
      return t(
        `连上工作台后会加载${resourceName}。`,
        `The ${resourceName} will load as soon as the environment is ready.`,
      );
    case "unsupported":
      return t(
        "请使用相互兼容的客户端和工作台版本。",
        "Use compatible versions of the app and server to connect.",
      );
    case "available":
    case "error":
      return t(
        `重新连接工作台以加载${resourceName}。`,
        `Reconnect the environment to load the ${resourceName}.`,
      );
    case "connected":
      return "";
  }
}

export function EnvironmentConnectionNotice(props: {
  readonly environmentLabel: string | undefined;
  readonly connection: EnvironmentConnectionPresentation;
  readonly resourceName: keyof typeof resources;
  readonly onRetry: () => void;
}) {
  const language = useWorkbenchLanguage();
  const environmentLabel = props.environmentLabel ?? (language === "zh" ? "工作台" : "Environment");
  const isRetrying =
    props.connection.phase === "connecting" || props.connection.phase === "reconnecting";

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="max-w-[320px] items-center gap-3">
        {isRetrying ? (
          <AppActivityIndicator size="small" colorClassName={"accent-icon-muted"} />
        ) : (
          <SymbolView
            name={props.connection.phase === "offline" ? "wifi.slash" : "bolt.horizontal.circle"}
            size={24}
            tintColorClassName={"accent-icon-muted"}
            type="monochrome"
          />
        )}

        <Text className="text-center text-lg font-t3-bold text-foreground">
          {noticeTitle(props.connection.phase, environmentLabel, language)}
        </Text>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          {noticeDetail(
            props.connection.phase,
            resources[props.resourceName][language],
            props.connection.error,
            language,
          )}
          {props.connection.traceId ? (
            <ConnectionTraceId traceId={props.connection.traceId} />
          ) : null}
        </Text>

        {props.connection.phase !== "offline" && props.connection.phase !== "unsupported" ? (
          <View className="mt-1">
            <Button
              label={language === "zh" ? "立即重试" : "Retry now"}
              tone="secondary"
              onPress={props.onRetry}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
