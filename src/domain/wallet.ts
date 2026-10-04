import { DomainError } from "./errors";
import type { Satang } from "./money";

export type EntryKind = "expense" | "income" | "repayment" | "transfer";

/** One entry as seen by a wallet: where the money left from and, for a transfer, where it went. */
export interface WalletMovement {
  kind: EntryKind;
  total: Satang;
  walletId: string;
  toWalletId: string | null;
}

/**
 * What one entry does to each wallet it touches. An expense takes its full total (fronting included: the
 * money really left), income and repayments bring money in, a transfer moves it between two wallets.
 * The SQL in WalletRepo.netFlows mirrors this.
 */
export function walletDeltas(m: WalletMovement): [walletId: string, delta: Satang][] {
  switch (m.kind) {
    case "expense":
      return [[m.walletId, -m.total]];
    case "income":
    case "repayment":
      return [[m.walletId, m.total]];
    case "transfer":
      return [
        [m.walletId, -m.total],
        [m.toWalletId!, m.total],
      ];
  }
}

/** Net money in minus money out per wallet. Wallets nothing touched are absent. */
export function netFlows(movements: Iterable<WalletMovement>): Map<string, Satang> {
  const out = new Map<string, Satang>();
  for (const m of movements) for (const [id, d] of walletDeltas(m)) out.set(id, (out.get(id) ?? 0) + d);
  return out;
}

/** A wallet's balance is never stored: it is the opening balance plus everything that went through it. */
export const walletBalance = (openingBalance: Satang, net: Satang | undefined): Satang => openingBalance + (net ?? 0);

/** The opening balance that makes the wallet show `actual` now (for "set the balance to what I really have"). */
export const openingFor = (actual: Satang, net: Satang | undefined): Satang => actual - (net ?? 0);

export function assertTransfer(fromId: string, toId: string): void {
  if (fromId === toId) throw new DomainError("INVALID_TRANSFER", "a transfer needs two different wallets");
}

/** Opening balances may be negative (a credit card), but must stay a whole number of satang. */
export function assertSignedSatang(value: number): Satang {
  if (!Number.isSafeInteger(value)) throw new DomainError("INVALID_AMOUNT", `not a valid satang amount: ${value}`);
  return value;
}
