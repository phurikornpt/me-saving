import { describe, expect, it } from "vitest";
import { assertSignedSatang, assertTransfer, netFlows, openingFor, walletBalance } from "./wallet";

describe("wallet balances", () => {
  it("expenses take the full total, income and repayments add, transfers move between two wallets", () => {
    const net = netFlows([
      { kind: "income", total: 50000, walletId: "bank", toWalletId: null },
      { kind: "expense", total: 10000, walletId: "cash", toWalletId: null }, // fronted or not: 100 left the wallet
      { kind: "repayment", total: 5000, walletId: "cash", toWalletId: null },
      { kind: "transfer", total: 20000, walletId: "bank", toWalletId: "cash" },
    ]);
    expect(net).toEqual(new Map([["bank", 30000], ["cash", 15000]]));
  });

  it("balance = opening + net; setting the real balance works the opening out backwards", () => {
    expect(walletBalance(1000, 15000)).toBe(16000);
    expect(walletBalance(1000, undefined)).toBe(1000);
    expect(walletBalance(0, -5000)).toBe(-5000); // a credit card goes below zero
    const opening = openingFor(4200, 15000);
    expect(walletBalance(opening, 15000)).toBe(4200);
  });

  it("refuses a transfer to the same wallet and non-integer openings", () => {
    expect(() => assertTransfer("a", "a")).toThrow(expect.objectContaining({ code: "INVALID_TRANSFER" }));
    expect(() => assertTransfer("a", "b")).not.toThrow();
    expect(assertSignedSatang(-300)).toBe(-300);
    expect(() => assertSignedSatang(1.5)).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });
});
