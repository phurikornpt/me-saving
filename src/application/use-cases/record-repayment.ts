import { assertSatang, type Satang } from "@/domain/money";
import { assertRepaymentAllowed, partnerBalance } from "@/domain/partner";
import { XP_PARTNER_CLEARED } from "@/domain/xp";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";

export type RecordRepaymentOutput = ActivityResult & {
  entry: EntryRecord;
  balanceAfter: Satang;
};

export class RecordRepayment {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: { amount: Satang; note?: string | null }): Promise<RecordRepaymentOutput> {
    assertSatang(input.amount);
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      const { expenses, repayments } = await repos.entries.partnerLedger();
      const balance = partnerBalance(expenses, repayments);
      assertRepaymentAllowed(balance, input.amount);

      const entry = await repos.entries.insert({
        kind: "repayment",
        occurredAt: now,
        createdAt: now,
        total: input.amount,
        partnerShare: 0,
        categoryId: null,
        note: input.note ?? null,
        merchant: null,
        source: "wheel",
      });
      const balanceAfter = balance - input.amount;
      const bonus = balanceAfter === 0 ? XP_PARTNER_CLEARED : 0;
      return { entry, balanceAfter, ...(await logActivity(repos, now, "entry", bonus)) };
    });
  }
}
