import { useState } from "react";
import type { AgentShareAccountDevice } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { SettingsRow } from "../settings/settingsLayout";

export function AgentShareDevices({
  devices,
  currentDeviceId,
  language,
  disabled,
  onRevoke,
}: {
  devices: ReadonlyArray<AgentShareAccountDevice>;
  currentDeviceId: string;
  language: "zh" | "en";
  disabled: boolean;
  onRevoke: (id: string) => Promise<void>;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [confirming, setConfirming] = useState<string>();
  const [limit, setLimit] = useState(20);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t(
          "断开后，该设备不能继续使用账号余额，共享也会暂停。当前设备请使用退出登录。",
          "Unlinking removes the device’s access to your balance and pauses its sharing. Use sign out for the current device.",
        )}
      </p>
      {devices.length === 0 ? <p>{t("暂无设备。", "No devices.")}</p> : null}
      {devices.slice(0, limit).map((device) => {
        const current = device.id === currentDeviceId;
        const inactive = Boolean(device.revoked_at);
        return (
          <SettingsRow
            key={device.id}
            title={device.name}
            description={[
              device.id,
              device.created_at,
              current ? t("当前设备", "Current device") : "",
              device.revoked_at ? t("已断开", "Unlinked") : t("已授权", "Authorized"),
              device.expires_at ? `${t("到期时间", "Expires")}: ${device.expires_at}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            control={
              confirming === device.id ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setConfirming(undefined)}
                  >
                    {t("取消", "Cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={disabled}
                    onClick={async () => {
                      await onRevoke(device.id);
                      setConfirming(undefined);
                    }}
                  >
                    {t("确认断开", "Confirm unlink")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || current || inactive}
                  onClick={() => setConfirming(device.id)}
                >
                  {t("断开连接", "Unlink")}
                </Button>
              )
            }
          />
        );
      })}
      {devices.length > limit ? (
        <Button size="sm" variant="outline" onClick={() => setLimit(limit + 20)}>
          {t("显示更多设备", "Show more devices")}
        </Button>
      ) : null}
    </>
  );
}
