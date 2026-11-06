import { useState } from "react";
import { Alert } from "react-native";
import type { AgentShareAccountDevice } from "@t3tools/contracts";
import { AppText as Text } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";

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
  const [limit, setLimit] = useState(20);
  return (
    <>
      <Text className="px-5 py-2" textRole="body">
        {t(
          "断开后，该设备不能继续使用账号余额，共享也会暂停。当前设备请使用退出登录。",
          "Unlinking removes the device’s access to your balance and pauses its sharing. Use sign out for the current device.",
        )}
      </Text>
      {devices.length === 0 ? (
        <Text className="px-5 py-2" textRole="body">
          {t("暂无设备。", "No devices.")}
        </Text>
      ) : null}
      {devices.slice(0, limit).map((device) => {
        const current = device.id === currentDeviceId;
        const inactive = Boolean(device.revoked_at);
        return (
          <ListActionRow
            key={device.id}
            label={device.name}
            description={[
              device.id,
              device.created_at,
              current ? t("当前设备", "Current device") : "",
              device.revoked_at ? t("已断开", "Unlinked") : t("已授权", "Authorized"),
              device.expires_at ? `${t("到期时间", "Expires")}: ${device.expires_at}` : "",
              !inactive && !current ? t("点按以断开连接", "Tap to unlink") : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            disabled={disabled || current || inactive}
            onPress={() =>
              Alert.alert(
                t("确认断开设备", "Unlink device"),
                `${device.name} · ${device.id}\n${t("该设备将不能继续使用账号余额，共享也会暂停。", "This device will lose access to your balance and its sharing will pause.")}`,
                [
                  { text: t("取消", "Cancel"), style: "cancel" },
                  {
                    text: t("确认断开", "Confirm unlink"),
                    style: "destructive",
                    onPress: () => void onRevoke(device.id),
                  },
                ],
              )
            }
          />
        );
      })}
      {devices.length > limit ? (
        <ListActionRow
          label={t("显示更多设备", "Show more devices")}
          onPress={() => setLimit(limit + 20)}
        />
      ) : null}
    </>
  );
}
