import { describe, expect, it, vi } from "vite-plus/test";
import {
  formatWalletAmount,
  parseWalletMinorAmount,
  walletMinorFactor,
  walletRecordStatus,
} from "./agentShareWallet.ts";
describe("wallet money display", () => {
  it("parses exact platform minor units without rounding or accepting exponent input", () => {
    expect(parseWalletMinorAmount("10.29", "USD")).toBe(1029);
    expect(parseWalletMinorAmount(" 01.2 ", "CNY")).toBe(120);
    expect(parseWalletMinorAmount("100", "JPY")).toBe(100);
    expect(walletMinorFactor("JPY")).toBe(1_000_000);
    expect(parseWalletMinorAmount("10000000.00", "USD")).toBe(1_000_000_000);
    for (const value of ["", "-1", "+1", "1e3", "1.001", "1,000", "NaN", "10000000.01"])
      expect(parseWalletMinorAmount(value, "USD")).toBeUndefined();
    expect(parseWalletMinorAmount("1.00", "JPY")).toBeUndefined();
    expect(parseWalletMinorAmount("1", "XXX")).toBeUndefined();
  });
  it("retains exact micro-units for small charges and large balances", () => {
    const original = Intl.NumberFormat.prototype.formatToParts;
    const parts = vi
      .spyOn(Intl.NumberFormat.prototype, "formatToParts")
      .mockImplementation(function (this: Intl.NumberFormat, value) {
        if (typeof value === "bigint") throw new TypeError("BigInt formatting unavailable");
        return original.call(this, value);
      });
    try {
      expect(formatWalletAmount(47698, "USD", "en")).toBe("$0.047698");
      expect(formatWalletAmount(33389, "USD", "en")).toBe("$0.033389");
      expect(formatWalletAmount(Number.MAX_SAFE_INTEGER, "USD", "en")).toBe(
        "$9,007,199,254.740991",
      );
      parts.mockImplementation(() => {
        throw new TypeError("Native locale formatting unavailable");
      });
      expect(formatWalletAmount(207602600, "USD", "en")).toBe("USD 207.6026");
      expect(formatWalletAmount(-1, "USD", "zh")).toBe("USD -0.000001");
      expect(formatWalletAmount(0, "USD", "zh")).toBe("USD 0.00");
    } finally {
      parts.mockRestore();
    }
  });
  it("formats negative sub-unit amounts and rejects invalid input", () => {
    expect(formatWalletAmount(-1, "USD", "en")).toBe("-$0.000001");
    expect(formatWalletAmount(0, "USD", "en")).toBe("$0.00");
    expect(formatWalletAmount(NaN, "USD", "en")).toBe("N/A");
  });
});

describe("wallet status display", () => {
  it("distinguishes settlement, a credited top-up, and a recorded payout", () => {
    expect(walletRecordStatus("settled", "spending", "zh")).toBe("已结算");
    expect(walletRecordStatus("settled", "earnings", "en")).toBe("Settled");
    expect(walletRecordStatus("paid", "topups", "zh")).toBe("充值已到账");
    expect(walletRecordStatus("paid", "withdrawals", "zh")).toBe("已记录付款");
    expect(walletRecordStatus("expired", "topups", "en")).toBe("Expired");
    expect(walletRecordStatus(undefined, "operator_credits", "zh")).toBeUndefined();
    expect(walletRecordStatus("future_status", "spending", "en")).toBe("future_status");
  });
});
