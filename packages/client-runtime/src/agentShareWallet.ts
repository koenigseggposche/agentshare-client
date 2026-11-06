export function formatWalletAmount(
  micros: number,
  currency: string,
  language: "zh" | "en",
): string {
  if (!Number.isSafeInteger(micros) || !/^[A-Z]{3}$/.test(currency)) return "N/A";
  const amount = BigInt(Math.abs(micros));
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0{1,4}$/, "");
  const sample = micros < 0 ? -(whole || 1n) : whole;
  try {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })
      .formatToParts(Number(sample))
      .map((part) =>
        part.type === "fraction"
          ? fraction
          : part.type === "integer" && whole === 0n
            ? "0"
            : part.value,
      )
      .join("");
  } catch {
    return `${currency} ${micros < 0 ? "-" : ""}${whole}.${fraction}`;
  }
}

export function walletMinorFactor(currency: string): number | undefined {
  if (currency === "JPY") return 1_000_000;
  return ["USD", "CNY", "EUR", "GBP", "HKD"].includes(currency) ? 10_000 : undefined;
}

export function parseWalletMinorAmount(raw: string, currency: string): number | undefined {
  const factor = walletMinorFactor(currency);
  const value = raw.trim();
  if (
    factor === undefined ||
    value.length > 32 ||
    !(currency === "JPY" ? /^[0-9]+$/ : /^[0-9]+(?:\.[0-9]{1,2})?$/).test(value)
  )
    return undefined;
  const [whole = "", fraction = ""] = value.split(".");
  const amount =
    BigInt(whole) * (currency === "JPY" ? 1n : 100n) +
    (currency === "JPY" ? 0n : BigInt(fraction.padEnd(2, "0")));
  return amount <= 1_000_000_000n ? Number(amount) : undefined;
}

export function walletFundStatus(
  status: string,
  action: "topup" | "withdraw",
  language: "zh" | "en",
): string {
  const labels: Record<string, readonly [string, string]> = {
    pending: ["等待付款", "Awaiting payment"],
    requested: ["等待转账", "Awaiting transfer"],
    processing: ["转账确认中", "Transfer confirmation pending"],
    transferred: [
      "已转入收款账户，银行到账需另行确认",
      "Transferred to payout account; bank arrival is separate",
    ],
    paid:
      action === "topup" ? ["充值已到账", "Balance credited"] : ["已记录付款", "Payment recorded"],
    rejected: ["已拒绝", "Rejected"],
  };
  const label = labels[status] ?? ["需要核对平台记录", "Check platform records"];
  return label[language === "zh" ? 0 : 1];
}
