import { DomainError } from "./errors";
import type { Satang } from "./money";

/** One person's part of one fronted expense. */
export interface OwedShare {
  entryId: string;
  personId: string;
  occurredAt: Date;
  amount: Satang;
}

export interface PersonRepayment {
  personId: string;
  total: Satang;
}

export interface Ledger {
  shares: OwedShare[];
  repayments: PersonRepayment[];
}

/** What each person still owes us. People with nothing on the ledger are absent. */
export function balances({ shares, repayments }: Ledger): Map<string, Satang> {
  const out = new Map<string, Satang>();
  for (const s of shares) out.set(s.personId, (out.get(s.personId) ?? 0) + s.amount);
  for (const r of repayments) out.set(r.personId, (out.get(r.personId) ?? 0) - r.total);
  return out;
}

export const balanceOf = (ledger: Ledger, personId: string): Satang => balances(ledger).get(personId) ?? 0;

/** The balance can never go negative: this app only tracks "they owe me". */
export function assertRepaymentAllowed(balance: Satang, amount: Satang): void {
  if (amount <= 0) throw new DomainError("INVALID_AMOUNT", "repayment must be positive");
  if (amount > balance) {
    throw new DomainError("REPAYMENT_EXCEEDS_BALANCE", `balance ${balance}, repayment ${amount}`);
  }
}

export function assertNoNegativeBalance(ledger: Ledger): void {
  for (const [, b] of balances(ledger)) {
    if (b < 0) throw new DomainError("BALANCE_WOULD_GO_NEGATIVE", "repayments would exceed what someone owes");
  }
}

export interface OutstandingItem {
  entryId: string;
  occurredAt: Date;
  amount: Satang;
  outstanding: Satang;
}

/**
 * A derived view (never stored): apply one person's total repayments to their oldest
 * shares first. Returns only entries that still have something outstanding.
 */
export function outstandingByEntry(ledger: Ledger, personId: string): OutstandingItem[] {
  let pool = ledger.repayments.filter((r) => r.personId === personId).reduce((s, r) => s + r.total, 0);
  const oldestFirst = ledger.shares
    .filter((s) => s.personId === personId && s.amount > 0)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const result: OutstandingItem[] = [];
  for (const s of oldestFirst) {
    const applied = Math.min(pool, s.amount);
    pool -= applied;
    const outstanding = s.amount - applied;
    if (outstanding > 0) result.push({ entryId: s.entryId, occurredAt: s.occurredAt, amount: s.amount, outstanding });
  }
  return result;
}
