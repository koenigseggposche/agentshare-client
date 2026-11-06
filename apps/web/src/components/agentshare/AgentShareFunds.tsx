import { randomUUID } from "../../lib/utils";
import { useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareFundsCommandInput,
  AgentShareFundsResult,
  AgentShareWalletOverview,
  EnvironmentId,
} from "@t3tools/contracts";
import {
  formatWalletAmount,
  parseWalletMinorAmount,
  walletMinorFactor,
  walletFundStatus,
} from "@t3tools/client-runtime/agentShareWallet";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function AgentShareFunds({
  environmentId,
  owner,
  language,
  overview,
  onChanged,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
  overview: AgentShareWalletOverview;
  onChanged: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const query = useEnvironmentQuery(
    agentShareEnvironment.funds({ environmentId, input: { owner, action: "read" } }),
  );
  const command = useAtomCommand(agentShareEnvironment.fundsCommand, { reportFailure: false });
  const read = useAtomCommand(agentShareEnvironment.fundsRead, { reportFailure: false });
  const canCommand = useAtomValue(agentShareEnvironment.fundsCommand.permissionAtom(environmentId));
  const [result, setResult] = useState<AgentShareFundsResult>();
  const [amount, setAmount] = useState(overview.currency === "JPY" ? "100" : "10.00");
  const [action, setAction] = useState<"topup" | "withdraw">("topup");
  const [country, setCountry] = useState(overview.payout_countries?.[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const current = result ?? (!query.error ? query.data : undefined);
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
  const blocked = !canCommand || busy || uncertain || !current;
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
      const outcome = await command({ environmentId, input });
      if (outcome._tag === "Success") {
        setResult(outcome.value);
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
    try {
      const outcome = await read({
        environmentId,
        input: { owner, action: reconcile ? "reconcile" : "read" },
      });
      if (outcome._tag === "Success") {
        setResult(outcome.value);
        setUncertain(false);
        onChanged();
      } else setError(true);
    } catch {
      setError(true);
    }
    running.current = false;
    setBusy(false);
  };
  const open = async () => {
    if (!current?.handoff_url) return;
    try {
      await ensureLocalApi().shell.openExternal(current.handoff_url);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="space-y-3">
      <h3 className="font-medium">{t("充值与提现", "Top-ups and withdrawals")}</h3>
      {!overview.checkout_enabled ? (
        <p>
          {t(
            "此服务暂未提供在线充值，已有充值记录仍可查看。",
            "Online top-ups are unavailable on this service. Existing records remain available.",
          )}
        </p>
      ) : null}
      {!overview.payouts_enabled ? (
        <p>
          {t(
            "此服务暂未提供提现，已有提现记录仍可查看。",
            "Withdrawals are unavailable on this service. Existing records remain available.",
          )}
        </p>
      ) : null}
      {!canCommand ? (
        <p>
          {t(
            "此连接没有管理资金权限。请在执行电脑上操作，或使用明确授予管理资金权限的连接。",
            "This connection cannot manage funds. Use the execution host or a connection explicitly granted funds access.",
          )}
        </p>
      ) : null}
      {query.error || error ? (
        <p role="alert">
          {t(
            "未能确认操作结果。先读取操作记录或核对平台状态；请勿另建相同支付。",
            "The outcome could not be confirmed. Read the saved operation or check platform records before creating another payment.",
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh(false)}>
          {t("读取操作记录", "Read saved operation")}
        </Button>
        {operation && operation.state !== "prepared" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh(true)}>
            {t("核对平台状态", "Check platform records")}
          </Button>
        ) : null}
      </div>
      {operation ? (
        <div className="space-y-2">
          <p>
            {operation.intent.action === "topup" ? t("充值", "Top-up") : t("提现", "Withdrawal")} ·{" "}
            {money(operation.intent.amount_minor, operation.intent.currency)}
          </p>
          <p>
            {operation.state === "prepared"
              ? t("待确认，尚未提交。", "Prepared for your confirmation; not submitted.")
              : operation.state === "unconfirmed"
                ? t(
                    "结果未确认。请先核账；重试沿用原请求编号。",
                    "Outcome unknown. Check records first; retry keeps the original request ID.",
                  )
                : `${t("平台状态", "Platform status")}: ${walletFundStatus(receipt?.status ?? "", operation.intent.action, language)}`}
          </p>
          {receipt ? <p className="break-all text-sm text-muted-foreground">{receipt.id}</p> : null}
          <div className="flex flex-wrap gap-2">
            {operation.state === "prepared" ? (
              <>
                <Button
                  size="sm"
                  disabled={submissionBlocked}
                  onClick={() =>
                    void run({ owner, action: "submit", key: operation.intent.key, retry: false })
                  }
                >
                  {operation.intent.action === "topup"
                    ? t("确认创建充值", "Confirm top-up")
                    : t("确认提交提现", "Confirm withdrawal")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => void run({ owner, action: "cancel", key: operation.intent.key })}
                >
                  {t("取消准备", "Cancel preparation")}
                </Button>
              </>
            ) : null}
            {operation.state === "unconfirmed" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={submissionBlocked}
                onClick={() =>
                  void run({ owner, action: "submit", key: operation.intent.key, retry: true })
                }
              >
                {t("用原编号重试", "Retry original request")}
              </Button>
            ) : null}
            {operation.state === "confirmed" &&
            receipt?.status === "pending" &&
            operation.intent.action === "topup" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={blocked}
                onClick={() =>
                  void run({ owner, action: "resumeCheckout", key: operation.intent.key })
                }
              >
                {t("恢复支付链接", "Restore checkout link")}
              </Button>
            ) : null}
            {operation.state === "confirmed" &&
            ["requested", "processing"].includes(receipt?.status ?? "") &&
            operation.intent.action === "withdraw" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={blocked}
                onClick={() =>
                  void run({ owner, action: "retryWithdrawal", key: operation.intent.key })
                }
              >
                {t("确认重试原提现", "Confirm retry of this withdrawal")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {current?.handoff_url ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void open()}>
          {t("打开支付服务页面", "Open payment service")}
        </Button>
      ) : null}
      {!operation || operation.state === "confirmed" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={blocked || !overview.checkout_enabled}
              onClick={() => setAction("topup")}
            >
              {t("充值余额", "Top up balance")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={blocked || !overview.payouts_enabled}
              onClick={() => setAction("withdraw")}
            >
              {t("提现收益", "Withdraw earnings")}
            </Button>
          </div>
          <label className="block space-y-1">
            <span>
              {action === "topup"
                ? t("充值金额", "Top-up amount")
                : t("提现金额", "Withdrawal amount")}{" "}
              ({currency})
            </span>
            <Input
              aria-label={t("金额", "Amount")}
              inputMode="decimal"
              value={amount}
              disabled={blocked}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {action === "topup"
              ? t(
                  `充值范围：${money(100)} 至 ${money(100000)}。提交后在支付服务页面完成付款。`,
                  `Top-up range: ${money(100)} to ${money(100000)}. Complete payment on the payment service page after submission.`,
                )
              : t(
                  "只能提取已结算的可用收益。提交提现会冻结该金额，并向已设置的收款账户转账。",
                  "Withdraw settled available earnings. Submission holds this amount and sends it to your configured payout account.",
                )}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={
              blocked ||
              !valid ||
              (action === "topup"
                ? !overview.checkout_enabled
                : !overview.payouts_enabled || !payout?.ready)
            }
            onClick={() => {
              if (!valid || minor === undefined) return;
              try {
                void run({
                  owner,
                  action: "prepare",
                  intent: { action, key: randomUUID(), currency, amount_minor: minor },
                });
              } catch {
                setError(true);
              }
            }}
          >
            {t("核对金额", "Review amount")}
          </Button>
        </div>
      ) : null}
      {overview.payouts_enabled ? (
        <div className="space-y-2">
          <p>
            {payout?.ready
              ? t("收款账户已就绪。", "Payout account is ready.")
              : t("提现前需设置收款账户。", "Set up a payout account before withdrawing.")}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={blocked}
            onClick={() => void run({ owner, action: "payoutStatus" })}
          >
            {t("检查收款账户", "Check payout account")}
          </Button>
          <Select
            value={payout?.country || country}
            disabled={blocked || Boolean(payout?.country)}
            onValueChange={(value) => setCountry(value ?? "")}
          >
            <SelectTrigger aria-label={t("收款地区", "Payout country")}>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {countries.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t(
              "继续将为此账号准备所选地区的收款账户，并在支付服务页面完成开户。地区创建后不可更改。",
              "Continue to prepare a payout account in the selected country and complete onboarding with the payment service. The country cannot be changed after creation.",
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || !countries.includes(payout?.country || country)}
            onClick={() =>
              void run({ owner, action: "onboarding", country: payout?.country || country })
            }
          >
            {t("确认设置收款账户", "Confirm payout setup")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
