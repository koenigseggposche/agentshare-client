import { useState } from "react";
import type {
  AgentShareCommandInput,
  AgentShareDeviceStatus,
  AgentShareSharingSettings,
} from "@t3tools/contracts";
import {
  sharingCapacityOptions,
  sharingSourceLabel,
} from "@t3tools/client-runtime/agentShareSharing";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { AppText as Text } from "../../components/ui/AppText";
import { Menu } from "../../components/ui/Menu";

export function AgentShareSourceControls({
  source,
  language,
  blocked,
  run,
}: {
  source: AgentShareDeviceStatus["sources"][number];
  language: "zh" | "en";
  blocked: boolean;
  run: (input: AgentShareCommandInput) => Promise<void>;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [concurrency, setConcurrency] = useState(source.concurrency ?? 1);
  const [visibility, setVisibility] = useState<AgentShareSharingSettings["visibility"]>(
    source.visibility === "owner_only" ? "owner_only" : "community",
  );
  const configured = Boolean(source.provider_id || source.connected);
  const native = source.service === "codex" || source.service === "claude";
  const name =
    source.service === "local" ? source.key : source.service === "codex" ? "Codex" : "Claude";
  return (
    <>
      <Text className="px-5 py-3" textRole="body">
        {name} · {sharingSourceLabel(source, language)}
        {configured
          ? ` · ${source.concurrency ?? 1} · ${source.visibility === "owner_only" ? t("仅自己", "Only me") : t("社区", "Community")}`
          : ""}
      </Text>
      {configured ? (
        <>
          {source.connected ? (
            <ListActionRow
              label={
                source.accepting
                  ? t(`暂停 ${name}`, `Pause ${name}`)
                  : t(`恢复 ${name}`, `Resume ${name}`)
              }
              disabled={blocked || source.draining}
              onPress={() =>
                void run({
                  operation: source.accepting ? "pauseSharing" : "resumeSharing",
                  target: source.key,
                })
              }
            />
          ) : null}
          <ListActionRow
            label={t(`停止分享 ${name}`, `Stop sharing ${name}`)}
            description={t(
              "已接受的请求会先完成。停止后可以调整共享设置。",
              "Accepted requests finish first. Change sharing settings after stopping.",
            )}
            disabled={blocked}
            onPress={() => void run({ operation: "stopSharing", target: source.key })}
          />
        </>
      ) : native ? (
        <>
          <Menu
            accessible
            accessibilityRole="button"
            accessibilityLabel={t(`${name} 并发请求`, `${name} concurrent requests`)}
            actions={sharingCapacityOptions.map((value) => ({
              id: String(value),
              title: String(value),
              state: value === concurrency ? "on" : "off",
              attributes: { disabled: blocked },
            }))}
            onPressAction={({ nativeEvent }) => {
              const value = sharingCapacityOptions.find(
                (value) => String(value) === nativeEvent.event,
              );
              if (value !== undefined && !blocked) setConcurrency(value);
            }}
          >
            <ListRowLayout
              label={t(`${name} 并发请求`, `${name} concurrent requests`)}
              detail={String(concurrency)}
              disabled={blocked}
            />
          </Menu>
          <Menu
            accessible
            accessibilityRole="button"
            accessibilityLabel={t(`${name} 共享范围`, `${name} sharing access`)}
            actions={(["owner_only", "community"] as const).map((value) => ({
              id: value,
              title: value === "owner_only" ? t("仅自己", "Only me") : t("社区", "Community"),
              state: visibility === value ? "on" : "off",
              attributes: { disabled: blocked },
            }))}
            onPressAction={({ nativeEvent }) => {
              if (
                !blocked &&
                (nativeEvent.event === "owner_only" || nativeEvent.event === "community")
              )
                setVisibility(nativeEvent.event);
            }}
          >
            <ListRowLayout
              label={t(`${name} 共享范围`, `${name} sharing access`)}
              detail={visibility === "owner_only" ? t("仅自己", "Only me") : t("社区", "Community")}
              description={t(
                "仅自己：同账号的其他设备。社区：其他账号按平台规则使用。",
                "Only me: your other devices. Community: other accounts under platform rules.",
              )}
              disabled={blocked}
            />
          </Menu>
          {!source.ready ? (
            <ListActionRow
              label={t(`在执行电脑登录 ${name}`, `Sign in to ${name} on host`)}
              disabled={blocked}
              onPress={() => void run({ operation: "nativeLogin", target: source.service })}
            />
          ) : null}
          <ListActionRow
            label={t(`开始分享 ${name}`, `Start sharing ${name}`)}
            disabled={blocked || !source.ready}
            onPress={() => {
              if (source.service === "codex" || source.service === "claude")
                void run({
                  operation: "startSharing",
                  body: { service: source.service, concurrency, visibility },
                });
            }}
          />
        </>
      ) : null}
    </>
  );
}
