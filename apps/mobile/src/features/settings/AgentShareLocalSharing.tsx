import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { AppText as Text } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";

export function AgentShareLocalSharing({
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
    agentShareEnvironment.modelManager({ environmentId, input: { owner } }),
  );
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const data = query.error ? undefined : query.data;
  return (
    <>
      {query.error ? (
        <Text accessibilityRole="alert">
          {t(
            "无法读取本地模型分享状态，请刷新。",
            "Could not load local model sharing. Refresh to try again.",
          )}
        </Text>
      ) : null}
      {unconfirmed ? (
        <Text accessibilityRole="alert">
          {t(
            "结果尚未确认，请先刷新检查。",
            "The outcome is unknown. Refresh and check before retrying.",
          )}
        </Text>
      ) : null}
      <ListActionRow
        label={t("刷新本地模型", "Refresh local models")}
        onPress={() => {
          setUnconfirmed(false);
          query.refresh();
        }}
      />
      {Object.entries(data?.state.installations ?? {})
        .filter(([, entry]) => entry.model.share_allowed)
        .map(([id, entry]) => (
          <SettingsSection key={id} title={entry.model.name}>
            {(["off", "owner_only", "community"] as const).map((visibility) => (
              <ListActionRow
                key={visibility}
                label={
                  visibility === "off"
                    ? t("关闭分享", "Sharing off")
                    : visibility === "owner_only"
                      ? t("仅自己", "Only me")
                      : t("社区", "Community")
                }
                disabled={
                  !allowed ||
                  query.isPending ||
                  pending ||
                  unconfirmed ||
                  (visibility !== "off" && data?.state.runtimes?.[id]?.state !== "ready") ||
                  data?.remote_access?.[id]?.draining ||
                  (data?.remote_access?.[id]?.visibility ?? "off") === visibility
                }
                onPress={async () => {
                  setPending(true);
                  const result = await command({
                    environmentId,
                    input: { operation: "modelSharing", body: { id, visibility } },
                  }).catch(() => null);
                  setUnconfirmed(result?._tag !== "Success");
                  query.refresh();
                  setPending(false);
                }}
              />
            ))}
          </SettingsSection>
        ))}
    </>
  );
}
