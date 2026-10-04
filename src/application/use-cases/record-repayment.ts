import { assertSatang, type Satang } from "@/domain/money";
import { assertRepaymentAllowed, balanceOf } from "@/domain/ledger";
import { XP_BALANCE_CLEARED } from "@/domain/xp";
import { assertKnownPeople } from "../known-people";
import { resolveWallet } from "../known-wallets";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";

export type RecordRepaymentOutput = ActivityResult & {
  entry: EntryRecord;
  balanceAfter: Satang;
};

/** Someone pays us back. It lowers what they owe; it is never income. */
export class RecordRepayment {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** `walletId`: where the money came in. Default: the default wallet. */
  async execute(input: {
    personId: string;
    amount: Satang;
    note?: string | null;
    walletId?: string | null;
  }): Promise<RecordRepaymentOutput> {
    assertSatang(input.amount);
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      await assertKnownPeople(repos.people, [input.personId]);
      const balance = balanceOf(await repos.entries.ledger(), input.personId);
      assertRepaymentAllowed(balance, input.amount);
      const walletId = await resolveWallet(repos.wallets, input.walletId);

      const entry = await repos.entries.insert({
        kind: "repayment",
        occurredAt: now,
        createdAt: now,
        total: input.amount,
        shares: [],
        personId: input.personId,
        categoryId: null,
        note: input.note ?? null,
        merchant: null,
        source: "wheel",
        walletId,
        toWalletId: null,
      });
      const balanceAfter = balance - input.amount;
      const bonus = balanceAfter === 0 ? XP_BALANCE_CLEARED : 0;
      return { entry, balanceAfter, ...(await logActivity(repos, now, "entry", bonus)) };
    });
  }
}
