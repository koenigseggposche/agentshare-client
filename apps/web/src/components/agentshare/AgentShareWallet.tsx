import { AgentShareFunds } from "./AgentShareFunds";
import { AgentShareDevices } from "./AgentShareDevices";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareWalletHistoryKind,
  AgentShareWalletReadInput,
  AgentShareWalletRecord,
  EnvironmentId,
} from "@t3tools/contracts";
import { formatWalletAmount, walletMinorFactor } from "@t3tools/client-runtime/agentShareWallet";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SettingsSection, SettingsRow } from "../settings/settingsLayout";

export function AgentShareWallet({
  environmentId,
  owner,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [selection, setSelection] = useState<AgentShareWalletReadInput>({
    action: "overview",
    owner,
  });
  const query = useEnvironmentQuery(
    agentShareEnvironment.wallet({ environmentId, input: selection }),
  );
  const command = useAtomCommand(agentShareEnvironment.walletCommand, {
    reportFailure: false,
  });
  const canCommand = useAtomValue(
    agentShareEnvironment.walletCommand.permissionAtom(environmentId),
  );
  const [commandPending, setCommandPending] = useState(false);
  const [commandUnconfirmed, setCommandUnconfirmed] = useState(false);
  const value = query.error ? undefined : query.data;
  const overview = value?.action === "overview" ? value.data : undefined;
  const details = value?.action === "detail" ? value.data : undefined;
  const kinds: ReadonlyArray<readonly [AgentShareWalletHistoryKind, string]> = [
    ["spending", t("消费记录", "Spending")],
    ["earnings", t("收益记录", "Earnings")],
    ["topups", t("充值记录", "Top-ups")],
    ["withdrawals", t("提现记录", "Withdrawals")],
    ["operator_credits", t("额度调整", "Balance adjustments")],
  ];
  const money = (micros: number, currency: string) =>
    formatWalletAmount(micros, currency, language);
  const record = (item: AgentShareWalletRecord, index: number) => (
    <SettingsRow
      key={item.request_id ?? item.id ?? index}
      title={
        item.model ??
        item.rate?.model ??
        item.reason ??
        item.request_id ??
        item.id ??
        t("记录", "Record")
      }
      description={[item.status, item.started_at ?? item.created_at, item.request_id]
        .filter(Boolean)
        .join(" · ")}
      control={
        <div className="flex items-center gap-3">
          <span>
            {money(
              (selection.action === "history" && selection.kind === "earnings"
                ? item.earned_micros
                : item.charged_micros) ??
                item.earned_micros ??
                item.amount_micros ??
                (item.amount_minor ?? 0) * (walletMinorFactor(item.currency ?? "USD") ?? 0),
              item.currency ?? "USD",
            )}
          </span>
          {item.request_id ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (item.request_id)
                  setSelection({ action: "detail", owner, request_id: item.request_id });
              }}
            >
              {t("详情", "Details")}
            </Button>
          ) : null}
        </div>
      }
    />
  );
  return (
    <SettingsSection title={t("账号钱包与设备", "Account wallet and devices")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "显示所选执行电脑当前账号的平台余额和账单。",
          "Platform balances and records for the selected host’s account.",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCommandUnconfirmed(false);
            query.refresh();
          }}
        >
          {t("刷新钱包", "Refresh wallet")}
        </Button>
        {selection.action !== "overview" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelection({ action: "overview", owner })}
          >
            {t("返回余额", "Back to balances")}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelection({ action: "devices", owner })}
        >
          {t("已登录设备", "Signed-in devices")}
        </Button>
        {kinds.map(([kind, label]) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            onClick={() => setSelection({ action: "history", owner, kind, cursor: "" })}
          >
            {label}
          </Button>
        ))}
      </div>
      {query.error ? (
        <p role="alert">
          {t(
            "无法读取账户信息，请刷新重试。",
            "Account data could not be loaded. Refresh to try again.",
          )}
        </p>
      ) : null}
      {commandUnconfirmed ? (
        <p role="alert">
          {t(
            "未能确认修改结果，请刷新钱包检查当前设置。",
            "The update could not be confirmed. Refresh the wallet to check the current setting.",
          )}
        </p>
      ) : null}
      {query.isPending && !value ? <p>{t("正在读取钱包…", "Loading wallet…")}</p> : null}
      {overview?.wallets.map((wallet) => (
        <div key={wallet.currency}>
          <SettingsRow
            title={t("可用余额", "Available balance")}
            description={wallet.currency}
            control={<strong>{money(wallet.available_micros, wallet.currency)}</strong>}
          />
          <SettingsRow
            title={t("冻结余额", "Held balance")}
            control={<span>{money(wallet.held_micros, wallet.currency)}</span>}
          />
          <SettingsRow
            title={t("待结算收益", "Pending earnings")}
            control={<span>{money(wallet.pending_earnings_micros, wallet.currency)}</span>}
          />
          <SettingsRow
            title={t("可用收益", "Available earnings")}
            control={<span>{money(wallet.available_earnings_micros, wallet.currency)}</span>}
          />
          <SettingsRow
            title={t("提现处理中", "Withdrawal hold")}
            control={<span>{money(wallet.withdrawal_held_micros, wallet.currency)}</span>}
          />
        </div>
      ))}
      {overview ? (
        <>
          <SettingsRow
            title={t("累计消费", "Total spending")}
            control={<span>{money(overview.summary.spent_micros, overview.currency)}</span>}
          />
          <SettingsRow
            title={t("累计收益", "Total earnings")}
            control={<span>{money(overview.summary.earned_micros, overview.currency)}</span>}
          />
          <SettingsRow
            title={t("收益优先支付", "Pay from earnings first")}
            description={t(
              "优先使用可用收益支付新请求；已开始的请求保持原付款方式。",
              "Use available earnings first for new requests. Requests already started keep their payment method.",
            )}
            control={
              <div className="flex items-center gap-3">
                <span>
                  {overview.payment_preference.earnings_first
                    ? t("已开启", "On")
                    : t("已关闭", "Off")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canCommand || commandPending || commandUnconfirmed || query.isPending}
                  onClick={async () => {
                    setCommandPending(true);
                    try {
                      const result = await command({
                        environmentId,
                        input: {
                          action: "paymentPreference",
                          owner,
                          currency: overview.payment_preference.currency,
                          earnings_first: !overview.payment_preference.earnings_first,
                        },
                      });
                      if (result._tag === "Success") query.refresh();
                      else setCommandUnconfirmed(true);
                    } catch {
                      setCommandUnconfirmed(true);
                    }
                    setCommandPending(false);
                  }}
                >
                  {overview.payment_preference.earnings_first
                    ? t("关闭", "Turn off")
                    : t("开启", "Turn on")}
                </Button>
              </div>
            }
          />
          <AgentShareFunds
            environmentId={environmentId}
            owner={owner}
            language={language}
            overview={overview}
            onChanged={query.refresh}
          />
          <p className="text-sm text-muted-foreground">{t("最近消费", "Recent spending")}</p>
          {overview.spending.slice(0, 6).map(record)}
        </>
      ) : null}
      {value?.action === "devices" ? (
        <AgentShareDevices
          devices={value.data.devices}
          currentDeviceId={value.data.current_device_id}
          language={language}
          disabled={!canCommand || commandPending || commandUnconfirmed || query.isPending}
          onRevoke={async (device_id) => {
            setCommandPending(true);
            try {
              const result = await command({
                environmentId,
                input: { action: "revokeDevice", owner, device_id },
              });
              if (result._tag === "Success") query.refresh();
              else setCommandUnconfirmed(true);
            } catch {
              setCommandUnconfirmed(true);
            }
            setCommandPending(false);
          }}
        />
      ) : null}
      {value?.action === "history" ? (
        <>
          {value.data.items.length === 0 ? (
            <p>{t("暂无记录。", "No records yet.")}</p>
          ) : (
            value.data.items.map(record)
          )}
          {value.data.next_cursor ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelection({
                  action: "history",
                  owner,
                  kind: value.kind,
                  cursor: value.data.next_cursor,
                })
              }
            >
              {t("下一页", "Next page")}
            </Button>
          ) : null}
        </>
      ) : null}
      {details ? (
        <>
          <SettingsRow title={t("请求编号", "Request")} description={details.request_id} />
          <SettingsRow
            title={t("模型", "Model")}
            description={details.model ?? details.rate.model ?? ""}
          />
          <SettingsRow title={t("状态", "Status")} description={details.status} />
          <SettingsRow
            title={t("扣费", "Charge")}
            control={<span>{money(details.charged_micros, details.currency)}</span>}
          />
          <SettingsRow
            title={t("Provider 收益", "Provider earnings")}
            control={<span>{money(details.earned_micros, details.currency)}</span>}
          />
          <SettingsRow
            title={t("输入 / 输出 Token", "Input / output tokens")}
            description={`${details.usage.input_tokens ?? 0} / ${details.usage.output_tokens ?? 0}`}
          />
          <SettingsRow
            title={t("缓存读取 Token", "Cached input tokens")}
            description={String(details.usage.cache_read_input_tokens ?? 0)}
          />
          <SettingsRow
            title={t("每百万输入 / 输出 Token", "Per million input / output tokens")}
            description={`${money(details.rate.input_micros_per_million, details.currency)} / ${money(details.rate.output_micros_per_million, details.currency)}`}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
