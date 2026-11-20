import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { AgentShareDevices } from "./AgentShareDevices";
import { SettingsSection } from "../settings/settingsLayout";
import { Button } from "../ui/button";

export function AgentShareAccountDevices({
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
    agentShareEnvironment.wallet({
      environmentId,
      input: { action: "devices", owner },
    }),
  );
  const command = useAtomCommand(agentShareEnvironment.walletCommand, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.walletCommand.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const devices = !query.error && query.data?.action === "devices" ? query.data.data : null;
  return (
    <SettingsSection
      title={t("已授权设备", "Authorized devices")}
      headerAction={
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setUncertain(false);
            query.refresh();
          }}
        >
          {t("刷新", "Refresh")}
        </Button>
      }
    >
      {query.error || uncertain ? (
        <p role="alert">
          {t(
            "无法确认设备状态，请刷新后核对。",
            "Device status could not be confirmed. Refresh to check.",
          )}
        </p>
      ) : null}
      {devices ? (
        <AgentShareDevices
          devices={devices.devices}
          currentDeviceId={devices.current_device_id}
          language={language}
          disabled={!allowed || pending || uncertain || query.isPending}
          onRevoke={async (device_id) => {
            setPending(true);
            const result = await command({
              environmentId,
              input: { action: "revokeDevice", owner, device_id },
            }).catch(() => null);
            if (result?._tag === "Success") query.refresh();
            else setUncertain(true);
            setPending(false);
          }}
        />
      ) : query.isPending ? (
        <p>{t("正在读取设备…", "Loading devices…")}</p>
      ) : null}
    </SettingsSection>
  );
}
