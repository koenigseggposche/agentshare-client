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
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "../settings/settingsLayout";

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
      <SettingsRow
        title={name}
        description={[
          sharingSourceLabel(source, language),
          configured
            ? t(`并发 ${source.concurrency ?? 1}`, `Concurrency ${source.concurrency ?? 1}`)
            : "",
          configured
            ? source.visibility === "owner_only"
              ? t("仅自己", "Only me")
              : t("社区", "Community")
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        control={
          <div className="flex flex-wrap gap-2">
            {configured ? (
              <>
                {source.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked || source.draining}
                    onClick={() =>
                      void run({
                        operation: source.accepting ? "pauseSharing" : "resumeSharing",
                        target: source.key,
                      })
                    }
                  >
                    {source.accepting ? t("暂停", "Pause") : t("恢复", "Resume")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => void run({ operation: "stopSharing", target: source.key })}
                >
                  {t("停止", "Stop")}
                </Button>
              </>
            ) : native ? (
              <>
                {!source.ready ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked}
                    onClick={() => void run({ operation: "nativeLogin", target: source.service })}
                  >
                    {t("在执行电脑登录", "Sign in on host")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked || !source.ready}
                  onClick={() => {
                    if (source.service === "codex" || source.service === "claude")
                      void run({
                        operation: "startSharing",
                        body: { service: source.service, concurrency, visibility },
                      });
                  }}
                >
                  {t("开始分享", "Start sharing")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {!configured && native ? (
        <>
          <SettingsRow
            title={t(`${name} 并发请求`, `${name} concurrent requests`)}
            control={
              <Select
                value={concurrency}
                disabled={blocked}
                onValueChange={(value) => {
                  if (value !== null) setConcurrency(value);
                }}
              >
                <SelectTrigger aria-label={t(`${name} 并发请求`, `${name} concurrent requests`)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {sharingCapacityOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title={t(`${name} 共享范围`, `${name} sharing access`)}
            description={t(
              "仅自己允许同账号的其他设备使用；社区允许其他账号按平台规则使用。",
              "Only me allows your other devices. Community allows other accounts under platform rules.",
            )}
            control={
              <Select
                value={visibility}
                disabled={blocked}
                onValueChange={(value) => {
                  if (value === "owner_only" || value === "community") setVisibility(value);
                }}
              >
                <SelectTrigger aria-label={t(`${name} 共享范围`, `${name} sharing access`)}>
                  <SelectValue>
                    {visibility === "owner_only" ? t("仅自己", "Only me") : t("社区", "Community")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="owner_only">{t("仅自己", "Only me")}</SelectItem>
                  <SelectItem value="community">{t("社区", "Community")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </>
      ) : configured ? (
        <SettingsRow
          title={t("调整共享设置", "Change sharing settings")}
          description={t(
            "停止分享后调整并发数与共享范围，再重新开始。已接受的请求会先完成。",
            "Stop sharing to change concurrency and access, then start again. Accepted requests finish first.",
          )}
        />
      ) : null}
    </>
  );
}
