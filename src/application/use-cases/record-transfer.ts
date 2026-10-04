import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { assertTransfer } from "@/domain/wallet";
import { assertActiveWallets } from "../known-wallets";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";

export interface RecordTransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: Satang;
  occurredAt?: Date;
  note?: string | null;
}

/**
 * Money moves between two of our wallets (cash out of the bank, paying the card bill). It is neither
 * spending nor income, so it never shows in the totals, and it is not "logging" either: no streak, no XP.
 */
export class RecordTransfer {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecordTransferInput): Promise<{ entry: EntryRecord }> {
    assertSatang(input.amount);
    if (input.amount === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
    assertTransfer(input.fromWalletId, input.toWalletId);
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      await assertActiveWallets(repos.wallets, [input.fromWalletId, input.toWalletId]);
      const entry = await repos.entries.insert({
        kind: "transfer",
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        total: input.amount,
        shares: [],
        personId: null,
        categoryId: null,
        note: input.note ?? null,
        merchant: null,
        source: "manual",
        walletId: input.fromWalletId,
        toWalletId: input.toWalletId,
      });
      return { entry };
    });
  }
}
