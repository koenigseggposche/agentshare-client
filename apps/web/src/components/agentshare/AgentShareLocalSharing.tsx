import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SettingsRow } from "../settings/settingsLayout";

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
        <p role="alert">
          {t(
            "无法读取本地模型分享状态，请刷新。",
            "Could not load local model sharing. Refresh to try again.",
          )}
        </p>
      ) : null}
      {unconfirmed ? (
        <p role="alert">
          {t(
            "结果尚未确认，请先刷新检查。",
            "The outcome is unknown. Refresh and check before retrying.",
          )}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setUnconfirmed(false);
          query.refresh();
        }}
      >
        {t("刷新本地模型", "Refresh local models")}
      </Button>
      {Object.entries(data?.state.installations ?? {})
        .filter(([, entry]) => entry.model.share_allowed)
        .map(([id, entry]) => (
          <SettingsRow
            key={id}
            title={entry.model.name}
            description={t("本地模型共享范围", "Local model sharing access")}
            control={
              <div className="flex flex-wrap gap-2">
                {(["off", "owner_only", "community"] as const).map((visibility) => (
                  <Button
                    key={visibility}
                    size="sm"
                    variant={
                      (data?.remote_access?.[id]?.visibility ?? "off") === visibility
                        ? "secondary"
                        : "outline"
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
                    onClick={async () => {
                      setPending(true);
                      const result = await command({
                        environmentId,
                        input: { operation: "modelSharing", body: { id, visibility } },
                      }).catch(() => null);
                      setUnconfirmed(result?._tag !== "Success");
                      query.refresh();
                      setPending(false);
                    }}
                  >
                    {visibility === "off"
                      ? t("关闭分享", "Sharing off")
                      : visibility === "owner_only"
                        ? t("仅自己", "Only me")
                        : t("社区", "Community")}
                  </Button>
                ))}
              </div>
            }
          />
        ))}
    </>
  );
}
