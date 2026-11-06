import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { useAtomValue } from "@effect/atom-react";
import * as FundsClient from "@agentshare/account-client/FundsClient";
import {
  AgentShareAccountError,
  type AgentShareFundsCommandInput,
  type AgentShareFundsReadInput,
  type AgentShareFundsResult,
  type AgentShareWalletOverview,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  formatWalletAmount,
  parseWalletMinorAmount,
  walletMinorFactor,
  walletFundStatus,
} from "@t3tools/client-runtime/agentShareWallet";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import * as Runtime from "../../lib/runtime";
import { uuidv4 } from "../../lib/uuid";
import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";

const personalRead = Effect.fn("AgentShareMobile.readFunds")(function* (
  input: AgentShareFundsReadInput,
) {
  return yield* (yield* FundsClient.FundsClient).read(input);
});
const personalCommand = Effect.fn("AgentShareMobile.commandFunds")(function* (
  input: AgentShareFundsCommandInput,
) {
  return yield* (yield* FundsClient.FundsClient).command(input);
});
const isAccountError = Schema.is(AgentShareAccountError);

type Props = {
  owner: string;
  language: "zh" | "en";
  overview: AgentShareWalletOverview;
  onChanged: () => void;
};

export function AgentShareRemoteFunds({
  environmentId,
  ...props
}: Props & { environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(
    agentShareEnvironment.funds({ environmentId, input: { owner: props.owner, action: "read" } }),
  );
  const read = useAtomCommand(agentShareEnvironment.fundsRead, { reportFailure: false });
  const command = useAtomCommand(agentShareEnvironment.fundsCommand, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.fundsCommand.permissionAtom(environmentId));
  return (
    <FundsView
      {...props}
      allowed={allowed}
      initial={query.error ? undefined : (query.data ?? undefined)}
      onRead={async (input) => {
        const outcome = await read({ environmentId, input });
        return outcome._tag === "Success" ? outcome.value : undefined;
      }}
      onCommand={async (input) => {
        const outcome = await command({ environmentId, input });
        return outcome._tag === "Success" ? outcome.value : undefined;
      }}
    />
  );
}

export function AgentSharePersonalFunds({
  onAccountChanged,
  ...props
}: Props & { onAccountChanged: () => void }) {
  const [initial, setInitial] = useState<AgentShareFundsResult>();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Load this device's durable private fund operation when its account is mounted.
  useEffect(() => {
    let active = true;
    void Runtime.runtime
      .runPromiseExit(personalRead({ owner: props.owner, action: "read" }))
      .then((exit) => {
        if (!active) return;
        if (Exit.isSuccess(exit)) setInitial(exit.value);
        else {
          const error = Cause.squash(exit.cause);
          if (
            isAccountError(error) &&
            ["sign-in-required", "account-changed"].includes(error.category)
          )
            onAccountChanged();
        }
      });
    return () => {
      active = false;
    };
  }, [props.owner, onAccountChanged]);
  return (
    <FundsView
      {...props}
      allowed
      initial={initial}
      onRead={async (input) => {
        const exit = await Runtime.runtime.runPromiseExit(personalRead(input));
        return Exit.isSuccess(exit) ? exit.value : undefined;
      }}
      onCommand={async (input) => {
        const exit = await Runtime.runtime.runPromiseExit(personalCommand(input));
        return Exit.isSuccess(exit) ? exit.value : undefined;
      }}
    />
  );
}

function FundsView({
  owner,
  language,
  overview,
  onChanged,
  initial,
  allowed,
  onRead,
  onCommand,
}: Props & {
  initial: AgentShareFundsResult | undefined;
  allowed: boolean;
  onRead: (input: AgentShareFundsReadInput) => Promise<AgentShareFundsResult | undefined>;
  onCommand: (input: AgentShareFundsCommandInput) => Promise<AgentShareFundsResult | undefined>;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [result, setResult] = useState<AgentShareFundsResult>();
  const [amount, setAmount] = useState(overview.currency === "JPY" ? "100" : "10.00");
  const [action, setAction] = useState<"topup" | "withdraw">("topup");
  const [country, setCountry] = useState(overview.payout_countries?.[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const current = result ?? initial;
  const operation = current?.operation;
  const receipt = operation?.receipt;
  const currency = overview.currency;
  const factor = walletMinorFactor(currency);
  const minor = parseWalletMinorAmount(amount, currency);
  const wallet = overview.wallets.find((entry) => entry.currency === currency);
  const valid =
    minor !== undefined &&
    minor >= 100 &&
    (action === "topup"
      ? minor <= 100000
      : factor !== undefined && minor * factor <= (wallet?.available_earnings_micros ?? 0));
  const payout = current?.payout ?? overview.payout_account;
  const countries = overview.payout_countries ?? [];
  const blocked = !allowed || busy || uncertain || !current;
  const submissionBlocked =
    blocked ||
    (operation?.intent.action === "topup"
      ? !overview.checkout_enabled
      : !overview.payouts_enabled || !payout?.ready);
  const money = (value: number, code = currency) =>
    formatWalletAmount(value * (walletMinorFactor(code) ?? 0), code, language);
  const run = async (input: AgentShareFundsCommandInput) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      const outcome = await onCommand(input);
      if (outcome) {
        setResult(outcome);
        setUncertain(false);
        onChanged();
      } else {
        setUncertain(true);
        setError(true);
      }
    } catch {
      setUncertain(true);
      setError(true);
    }
    running.current = false;
    setBusy(false);
  };
  const refresh = async (reconcile: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(false);
    const input: AgentShareFundsReadInput = { owner, action: reconcile ? "reconcile" : "read" };
    try {
      const outcome = await onRead(input);
      if (outcome) {
        setResult(outcome);
        setUncertain(false);
        onChanged();
      } else setError(true);
    } catch {
      setError(true);
    }
    running.current = false;
    setBusy(false);
  };
  return (
    <View>
      <Text className="px-5 py-2" textRole="body">
        {t("充值与提现", "Top-ups and withdrawals")}
      </Text>
      {!overview.checkout_enabled ? (
        <Text className="px-5 py-2" textRole="body">
          {t(
            "此服务暂未提供在线充值，已有充值记录仍可查看。",
            "Online top-ups are unavailable on this service. Existing records remain available.",
          )}
        </Text>
      ) : null}
      {!overview.payouts_enabled ? (
        <Text className="px-5 py-2" textRole="body">
          {t(
            "此服务暂未提供提现，已有提现记录仍可查看。",
            "Withdrawals are unavailable on this service. Existing records remain available.",
          )}
        </Text>
      ) : null}
      {!allowed ? (
        <Text className="px-5 py-2" textRole="body">
          {t(
            "此连接没有管理资金权限。请在执行电脑上操作，或使用明确授予管理资金权限的连接。",
            "This connection cannot manage funds. Use the host or a connection explicitly granted funds access.",
          )}
        </Text>
      ) : null}
      {error ? (
        <Text className="px-5 py-2" textRole="body" accessibilityRole="alert">
          {t(
            "未能确认结果。先读取操作记录或核对平台状态，请勿另建相同支付。",
            "The outcome could not be confirmed. Read the saved operation or check platform records before creating another payment.",
          )}
        </Text>
      ) : null}
      <ListActionRow
        label={t("读取操作记录", "Read saved operation")}
        disabled={busy}
        onPress={() => void refresh(false)}
      />
      {operation && operation.state !== "prepared" ? (
        <ListActionRow
          label={t("核对平台状态", "Check platform records")}
          disabled={busy}
          onPress={() => void refresh(true)}
        />
      ) : null}
      {operation ? (
        <>
          <Text className="px-5 py-2" textRole="body">
            {operation.intent.action === "topup" ? t("充值", "Top-up") : t("提现", "Withdrawal")} ·{" "}
            {money(operation.intent.amount_minor, operation.intent.currency)}
          </Text>
          <Text className="px-5 py-2" textRole="body">
            {operation.state === "prepared"
              ? t("待确认，尚未提交。", "Prepared for confirmation; not submitted.")
              : operation.state === "unconfirmed"
                ? t(
                    "结果未确认。请先核账；重试沿用原请求编号。",
                    "Outcome unknown. Check records first; retry keeps the original request ID.",
                  )
                : `${t("平台状态", "Platform status")}: ${walletFundStatus(receipt?.status ?? "", operation.intent.action, language)}`}
          </Text>
          {receipt ? (
            <Text selectable className="px-5 py-2" textRole="footnote">
              {receipt.id}
            </Text>
          ) : null}
          {operation.state === "prepared" ? (
            <>
              <ListActionRow
                label={
                  operation.intent.action === "topup"
                    ? t("确认创建充值", "Confirm top-up")
                    : t("确认提交提现", "Confirm withdrawal")
                }
                disabled={submissionBlocked}
                onPress={() =>
                  void run({ owner, action: "submit", key: operation.intent.key, retry: false })
                }
              />
              <ListActionRow
                label={t("取消准备", "Cancel preparation")}
                disabled={blocked}
                onPress={() => void run({ owner, action: "cancel", key: operation.intent.key })}
              />
            </>
          ) : null}
          {operation.state === "unconfirmed" ? (
            <ListActionRow
              label={t("确认用原编号重试", "Confirm retry of original request")}
              disabled={submissionBlocked}
              onPress={() =>
                void run({ owner, action: "submit", key: operation.intent.key, retry: true })
              }
            />
          ) : null}
          {operation.state === "confirmed" &&
          receipt?.status === "pending" &&
          operation.intent.action === "topup" ? (
            <ListActionRow
              label={t("恢复支付链接", "Restore checkout link")}
              disabled={blocked}
              onPress={() =>
                void run({ owner, action: "resumeCheckout", key: operation.intent.key })
              }
            />
          ) : null}
          {operation.state === "confirmed" &&
          ["requested", "processing"].includes(receipt?.status ?? "") &&
          operation.intent.action === "withdraw" ? (
            <ListActionRow
              label={t("确认重试原提现", "Confirm retry of this withdrawal")}
              disabled={blocked}
              onPress={() =>
                void run({ owner, action: "retryWithdrawal", key: operation.intent.key })
              }
            />
          ) : null}
        </>
      ) : null}
      {current?.handoff_url ? (
        <ListActionRow
          label={t("打开支付服务页面", "Open payment service")}
          disabled={busy}
          onPress={() => {
            if (current.handoff_url)
              void Linking.openURL(current.handoff_url).catch(() => setError(true));
          }}
        />
      ) : null}
      {!operation || operation.state === "confirmed" ? (
        <>
          <ListActionRow
            label={t("充值余额", "Top up balance")}
            disabled={blocked || !overview.checkout_enabled}
            onPress={() => setAction("topup")}
          />
          <ListActionRow
            label={t("提现收益", "Withdraw earnings")}
            disabled={blocked || !overview.payouts_enabled}
            onPress={() => setAction("withdraw")}
          />
          <View className="px-5 py-2 gap-2">
            <Text textRole="body">
              {action === "topup"
                ? t("充值金额", "Top-up amount")
                : t("提现金额", "Withdrawal amount")}{" "}
              ({currency})
            </Text>
            <AppTextInput
              accessibilityLabel={t("金额", "Amount")}
              value={amount}
              onChangeText={setAmount}
              editable={!blocked}
              keyboardType="decimal-pad"
              autoCorrect={false}
            />
            <Text textRole="footnote">
              {action === "topup"
                ? t(
                    `充值范围：${money(100)} 至 ${money(100000)}。提交后在支付服务页面完成付款。`,
                    `Top-up range: ${money(100)} to ${money(100000)}. Complete payment with the payment service after submission.`,
                  )
                : t(
                    "只能提取已结算的可用收益。提交后冻结该金额，并向已设置的收款账户转账。",
                    "Withdraw settled available earnings. Submission holds this amount and transfers it to your configured payout account.",
                  )}
            </Text>
          </View>
          <ListActionRow
            label={t("核对金额", "Review amount")}
            disabled={
              blocked ||
              !valid ||
              (action === "topup"
                ? !overview.checkout_enabled
                : !overview.payouts_enabled || !payout?.ready)
            }
            onPress={() => {
              if (!valid || minor === undefined) return;
              try {
                void run({
                  owner,
                  action: "prepare",
                  intent: { action, key: uuidv4(), currency, amount_minor: minor },
                });
              } catch {
                setError(true);
              }
            }}
          />
        </>
      ) : null}
      {overview.payouts_enabled ? (
        <>
          <Text className="px-5 py-2" textRole="body">
            {payout?.ready
              ? t("收款账户已就绪。", "Payout account is ready.")
              : t("提现前需设置收款账户。", "Set up a payout account before withdrawing.")}
          </Text>
          <ListActionRow
            label={t("检查收款账户", "Check payout account")}
            disabled={blocked}
            onPress={() => void run({ owner, action: "payoutStatus" })}
          />
          <View className="px-5 py-2 gap-2">
            <Text textRole="footnote">
              {t("收款地区", "Payout country")}: {countries.join(", ")}
            </Text>
            <AppTextInput
              accessibilityLabel={t("收款地区", "Payout country")}
              value={payout?.country || country}
              editable={!blocked && !payout?.country}
              onChangeText={(value) => setCountry(value.toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text textRole="footnote">
              {t(
                "继续将为此账号准备所选地区的收款账户，并在支付服务页面完成开户。地区创建后不可更改。",
                "Continue to prepare a payout account in the selected country and complete onboarding with the payment service. The country cannot be changed after creation.",
              )}
            </Text>
          </View>
          <ListActionRow
            label={t("确认设置收款账户", "Confirm payout setup")}
            disabled={blocked || !countries.includes(payout?.country || country)}
            onPress={() =>
              void run({ owner, action: "onboarding", country: payout?.country || country })
            }
          />
        </>
      ) : null}
    </View>
  );
}
