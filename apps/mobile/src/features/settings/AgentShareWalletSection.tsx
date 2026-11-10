import { AgentShareRemoteFunds } from "./AgentShareFunds";
import { AgentShareDevices } from "./AgentShareDevices";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareWalletReadInput,
  AgentShareWalletRecord,
  EnvironmentId,
  AgentShareWalletHistoryKind,
  AgentShareWalletReadResult,
  AgentShareWalletCommandInput,
} from "@t3tools/contracts";
import {
  formatWalletAmount,
  formatWalletDate,
  walletDealAmountLabels,
  walletMinorFactor,
  walletRecordStatus,
} from "@t3tools/client-runtime/agentShareWallet";
import { AppText as Text } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";

export function AgentShareWalletSection({
  environmentId,
  owner,
  language,
  taskId,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
  taskId?: string;
}) {
  const [selection, setSelection] = useState<AgentShareWalletReadInput>(
    taskId === undefined
      ? { action: "overview", owner }
      : { action: "history", owner, kind: "spending", cursor: "", workbench_task_id: taskId },
  );
  const query = useEnvironmentQuery(
    agentShareEnvironment.wallet({ environmentId, input: selection }),
  );
  const command = useAtomCommand(agentShareEnvironment.walletCommand, { reportFailure: false });
  const canCommand = useAtomValue(
    agentShareEnvironment.walletCommand.permissionAtom(environmentId),
  );
  return (
    <AgentShareWalletView
      owner={owner}
      language={language}
      selection={selection}
      {...(taskId === undefined ? {} : { taskId })}
      onSelect={setSelection}
      query={{ ...query, error: Boolean(query.error) }}
      canCommand={canCommand}
      onCommand={async (input) => (await command({ environmentId, input }))._tag === "Success"}
      funds={
        query.data?.action === "overview" && !query.error ? (
          <AgentShareRemoteFunds
            key={`${environmentId}:${owner}`}
            environmentId={environmentId}
            owner={owner}
            language={language}
            overview={query.data.data}
            onChanged={query.refresh}
          />
        ) : undefined
      }
    />
  );
}

export function AgentShareWalletView({
  owner,
  language,
  selection,
  taskId,
  onSelect: setSelection,
  query,
  personal = false,
  canCommand = false,
  onCommand,
  funds,
}: {
  owner: string;
  language: "zh" | "en";
  funds?: React.ReactNode;
  personal?: boolean;
  canCommand?: boolean;
  onCommand?: (input: AgentShareWalletCommandInput) => Promise<boolean>;
  selection: AgentShareWalletReadInput;
  taskId?: string;
  onSelect: (selection: AgentShareWalletReadInput) => void;
  query: {
    data: AgentShareWalletReadResult | null | undefined;
    error: boolean;
    errorCode?: string;
    isPending: boolean;
    refresh: () => void;
  };
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [detailSource, setDetailSource] = useState<AgentShareWalletReadInput | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const [commandUnconfirmed, setCommandUnconfirmed] = useState(false);
  const value = query.error ? undefined : query.data;
  const overview = value?.action === "overview" ? value.data : undefined;
  const detail = value?.action === "detail" ? value.data : undefined;
  const amountLabels = detail ? walletDealAmountLabels(detail, language) : undefined;
  const money = (micros: number, currency: string) =>
    formatWalletAmount(micros, currency, language);
  const kinds: ReadonlyArray<readonly [AgentShareWalletHistoryKind, string]> = [
    ["spending", t("消费记录", "Spending")],
    ["earnings", t("收益记录", "Earnings")],
    ["topups", t("充值记录", "Top-ups")],
    ["withdrawals", t("提现记录", "Withdrawals")],
    ["operator_credits", t("额度调整", "Balance adjustments")],
  ];
  const recordKind = selection.action === "history" ? selection.kind : "spending";
  const record = (item: AgentShareWalletRecord, index: number) => (
    <ListActionRow
      key={item.request_id ?? item.id ?? index}
      label={
        item.model ??
        item.rate?.model ??
        item.reason ??
        item.request_id ??
        item.id ??
        t("记录", "Record")
      }
      description={[
        money(
          (selection.action === "history" && selection.kind === "earnings"
            ? item.earned_micros
            : item.charged_micros) ??
            item.earned_micros ??
            item.amount_micros ??
            (item.amount_minor ?? 0) * (walletMinorFactor(item.currency ?? "USD") ?? 0),
          item.currency ?? "USD",
        ),
        walletRecordStatus(item.status, recordKind, language),
        formatWalletDate(item.started_at ?? item.created_at, language),
      ]
        .filter(Boolean)
        .join(" · ")}
      disabled={!item.request_id}
      onPress={() => {
        if (!item.request_id) return;
        setDetailSource(selection);
        setSelection({ action: "detail", owner, request_id: item.request_id });
      }}
    />
  );
  return (
    <SettingsSection
      {...(taskId === undefined
        ? { title: t("账号钱包与设备", "Account wallet and devices") }
        : {})}
    >
      {taskId === undefined ? (
        <Text className="px-5 py-2" textRole="body">
          {t(
            personal
              ? "此设备登录账号的平台余额和账单，不依赖执行电脑在线。"
              : "所选执行电脑当前账号的平台余额和账单。",
            personal
              ? "Balances and records for this device’s account, available without an execution host."
              : "Platform balances and records for the selected host’s account.",
          )}
        </Text>
      ) : null}
      <ListActionRow
        label={
          taskId === undefined ? t("刷新钱包", "Refresh wallet") : t("刷新账单", "Refresh charges")
        }
        onPress={() => {
          setCommandUnconfirmed(false);
          query.refresh();
        }}
      />
      {taskId === undefined ? (
        <ListActionRow
          label={t("已登录设备", "Signed-in devices")}
          onPress={() => setSelection({ action: "devices", owner })}
        />
      ) : null}
      {commandUnconfirmed ? (
        <Text className="px-5 py-2" textRole="body" accessibilityRole="alert">
          {t(
            "未能确认修改结果，请刷新钱包检查当前设置。",
            "The update could not be confirmed. Refresh the wallet to check the current setting.",
          )}
        </Text>
      ) : null}
      {(taskId === undefined ? selection.action !== "overview" : selection.action === "detail") ? (
        <ListActionRow
          label={
            taskId !== undefined
              ? t("返回任务账单", "Back to task charges")
              : selection.action === "detail" && detailSource?.action === "history"
                ? t("返回记录", "Back to records")
                : t("返回余额", "Back to balances")
          }
          onPress={() => {
            if (selection.action === "detail" && detailSource) {
              setSelection(detailSource);
              return;
            }
            setSelection(
              taskId === undefined
                ? { action: "overview", owner }
                : {
                    action: "history",
                    owner,
                    kind: "spending",
                    cursor: "",
                    workbench_task_id: taskId,
                  },
            );
          }}
        />
      ) : null}
      {query.error ? (
        <Text className="px-5 py-2" textRole="body">
          {t(
            "无法读取账户信息，请刷新重试。",
            "Account data could not be loaded. Refresh to try again.",
          )}
        </Text>
      ) : null}
      {query.error && query.errorCode ? (
        <Text testID="account-wallet-error-code" className="px-5 py-2" textRole="body">
          {t("错误代码", "Error code")}: {query.errorCode}
        </Text>
      ) : null}
      {query.isPending && !value ? (
        <Text className="px-5 py-2" textRole="body">
          {t("正在读取钱包…", "Loading wallet…")}
        </Text>
      ) : null}
      {overview?.wallets.map((wallet) => (
        <Text key={wallet.currency} className="px-5 py-2" textRole="body">
          {[
            `${t("可用余额", "Available balance")}: ${money(wallet.available_micros, wallet.currency)}`,
            `${t("冻结余额", "Held balance")}: ${money(wallet.held_micros, wallet.currency)}`,
            `${t("待结算收益", "Pending earnings")}: ${money(wallet.pending_earnings_micros, wallet.currency)}`,
            `${t("可用收益", "Available earnings")}: ${money(wallet.available_earnings_micros, wallet.currency)}`,
            `${t("提现处理中", "Withdrawal hold")}: ${money(wallet.withdrawal_held_micros, wallet.currency)}`,
          ].join("\n")}
        </Text>
      ))}
      {overview ? (
        <>
          {funds}
          <Text className="px-5 py-2" textRole="body">
            {t("累计消费", "Total spending")}:{" "}
            {money(overview.summary.spent_micros, overview.currency)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {t("累计收益", "Total earnings")}:{" "}
            {money(overview.summary.earned_micros, overview.currency)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {t("收益优先支付", "Pay from earnings first")}:{" "}
            {overview.payment_preference.earnings_first ? t("已开启", "On") : t("已关闭", "Off")}
          </Text>
          <ListActionRow
            label={
              overview.payment_preference.earnings_first
                ? t("关闭收益优先支付", "Turn off earnings-first payments")
                : t("开启收益优先支付", "Turn on earnings-first payments")
            }
            description={t(
              "优先使用可用收益支付新请求；已开始的请求保持原付款方式。",
              "Use available earnings first for new requests. Requests already started keep their payment method.",
            )}
            disabled={
              !canCommand || !onCommand || commandPending || commandUnconfirmed || query.isPending
            }
            onPress={async () => {
              if (!onCommand) return;
              setCommandPending(true);
              try {
                if (
                  await onCommand({
                    action: "paymentPreference",
                    owner,
                    currency: overview.payment_preference.currency,
                    earnings_first: !overview.payment_preference.earnings_first,
                  })
                )
                  query.refresh();
                else setCommandUnconfirmed(true);
              } catch {
                setCommandUnconfirmed(true);
              }
              setCommandPending(false);
            }}
          />
          {overview.spending.slice(0, 6).map(record)}
        </>
      ) : null}
      {value?.action === "devices" ? (
        <AgentShareDevices
          devices={value.data.devices}
          currentDeviceId={value.data.current_device_id}
          language={language}
          disabled={
            !canCommand || !onCommand || commandPending || commandUnconfirmed || query.isPending
          }
          onRevoke={async (device_id) => {
            if (!onCommand) return;
            setCommandPending(true);
            try {
              if (await onCommand({ action: "revokeDevice", owner, device_id })) query.refresh();
              else setCommandUnconfirmed(true);
            } catch {
              setCommandUnconfirmed(true);
            }
            setCommandPending(false);
          }}
        />
      ) : null}
      {taskId === undefined &&
        kinds.map(([kind, label]) => (
          <ListActionRow
            key={kind}
            label={label}
            onPress={() => setSelection({ action: "history", owner, kind, cursor: "" })}
          />
        ))}
      {value?.action === "history" ? (
        <>
          {value.data.items.length === 0 ? (
            <Text className="px-5 py-2" textRole="body">
              {t("暂无记录。", "No records yet.")}
            </Text>
          ) : (
            value.data.items.map(record)
          )}
          {value.data.next_cursor ? (
            <ListActionRow
              label={t("下一页", "Next page")}
              onPress={() =>
                setSelection({
                  action: "history",
                  owner,
                  kind: value.kind,
                  cursor: value.data.next_cursor,
                  ...(taskId === undefined ? {} : { workbench_task_id: taskId }),
                })
              }
            />
          ) : null}
        </>
      ) : null}
      {detail && amountLabels ? (
        <>
          <Text selectable className="px-5 py-2" textRole="body">
            {detail.request_id}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {detail.model ?? detail.rate.model ?? ""} ·{" "}
            {walletRecordStatus(detail.status, "spending", language)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {amountLabels.charge}: {money(detail.charged_micros, detail.currency)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {amountLabels.earnings}: {money(detail.earned_micros, detail.currency)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {t("输入 / 输出 Token", "Input / output tokens")}: {detail.usage.input_tokens ?? 0} /{" "}
            {detail.usage.output_tokens ?? 0}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {t("缓存读取 Token", "Cached input tokens")}:{" "}
            {detail.usage.cache_read_input_tokens ?? 0}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {t("每百万输入 / 输出 Token", "Per million input / output tokens")}:{" "}
            {money(detail.rate.input_micros_per_million, detail.currency)} /{" "}
            {money(detail.rate.output_micros_per_million, detail.currency)}
          </Text>
        </>
      ) : null}
    </SettingsSection>
  );
}
