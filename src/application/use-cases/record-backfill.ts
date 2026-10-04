import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { resolveWallet } from "../known-wallets";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";

export const MAX_BACKFILL_ROWS = 60;

export interface BackfillRow {
  kind: "expense" | "income";
  total: Satang;
  occurredAt: Date;
  categoryId?: string | null;
  note?: string | null;
}

export type RecordBackfillOutput = ActivityResult & { entries: EntryRecord[] };

/**
 * Saves many past entries at once (a bank-history screenshot, several slips). All or nothing.
 * Pressing save is ONE log of today: it counts once for streak and XP, however many rows it holds,
 * and it never fills in streak for the days the rows belong to.
 */
export class RecordBackfill {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: { walletId?: string | null; rows: BackfillRow[] }): Promise<RecordBackfillOutput> {
    if (input.rows.length === 0 || input.rows.length > MAX_BACKFILL_ROWS) {
      throw new DomainError("INVALID_AMOUNT", `save between 1 and ${MAX_BACKFILL_ROWS} rows`);
    }
    for (const r of input.rows) {
      assertSatang(r.total);
      if (r.total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
    }
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      const walletId = await resolveWallet(repos.wallets, input.walletId);
      const entries: EntryRecord[] = [];
      for (const r of input.rows) {
        entries.push(
          await repos.entries.insert({
            kind: r.kind,
            occurredAt: r.occurredAt,
            createdAt: now,
            total: r.total,
            shares: [],
            personId: null,
            categoryId: r.categoryId ?? null,
            note: r.note ?? null,
            merchant: null,
            source: "manual",
            walletId,
            toWalletId: null,
          }),
        );
      }
      return { entries, ...(await logActivity(repos, now, "entry")) };
    });
  }
}
