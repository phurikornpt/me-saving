import { DomainError } from "./errors";
import type { Satang } from "./money";

export interface PartnerExpense {
  id: string;
  occurredAt: Date;
  partnerShare: Satang;
}

export interface Repayment {
  total: Satang;
}

export const partnerBalance = (expenses: PartnerExpense[], repayments: Repayment[]): Satang =>
  expenses.reduce((s, e) => s + e.partnerShare, 0) - repayments.reduce((s, r) => s + r.total, 0);

/** The balance can never go negative: this app only tracks "partner owes me". */
export function assertRepaymentAllowed(balance: Satang, amount: Satang): void {
  if (amount <= 0) throw new DomainError("INVALID_AMOUNT", "repayment must be positive");
  if (amount > balance) {
    throw new DomainError("REPAYMENT_EXCEEDS_BALANCE", `balance ${balance}, repayment ${amount}`);
  }
}

export interface OutstandingItem {
  id: string;
  occurredAt: Date;
  partnerShare: Satang;
  outstanding: Satang;
}

/**
 * A derived view (never stored): apply total repayments to the oldest fronted
 * expenses first. Returns only entries that still have something outstanding.
 */
export function outstandingByEntry(
  expenses: PartnerExpense[],
  repayments: Repayment[],
): OutstandingItem[] {
  let pool = repayments.reduce((s, r) => s + r.total, 0);
  const oldestFirst = [...expenses]
    .filter((e) => e.partnerShare > 0)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const result: OutstandingItem[] = [];
  for (const e of oldestFirst) {
    const applied = Math.min(pool, e.partnerShare);
    pool -= applied;
    const outstanding = e.partnerShare - applied;
    if (outstanding > 0) result.push({ ...e, outstanding });
  }
  return result;
}
