import { DomainError } from "@/domain/errors";
import { resolveWallet } from "../known-wallets";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";
import { insertEntry, type RecordEntryInput } from "./record-entry";
import { insertGroup, type SaveReceiptInput } from "./save-receipt-entry";

export const MAX_BATCH_ITEMS = 60;

export type BatchItem =
  | ({ type: "entry" } & Omit<RecordEntryInput, "presetId">)
  | ({ type: "group" } & SaveReceiptInput);

export type RecordBatchOutput = ActivityResult & { entries: EntryRecord[] };

/**
 * Saves what one spoken / typed sentence described: several entries and groups at once. All or
 * nothing. Pressing save is ONE log of today: it counts once for streak and XP, however many items.
 */
export class RecordBatch {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: { walletId?: string | null; items: BatchItem[] }): Promise<RecordBatchOutput> {
    if (input.items.length === 0 || input.items.length > MAX_BATCH_ITEMS) {
      throw new DomainError("INVALID_AMOUNT", `save between 1 and ${MAX_BATCH_ITEMS} items`);
    }
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      // Fail early on a wallet nobody has, even when every item names its own.
      if (input.walletId) await resolveWallet(repos.wallets, input.walletId);
      const entries: EntryRecord[] = [];
      for (const item of input.items) {
        const walletId = item.walletId ?? input.walletId;
        entries.push(
          item.type === "entry"
            ? await insertEntry(repos, { ...item, walletId }, now)
            : await insertGroup(repos, { ...item, walletId }, now),
        );
      }
      return { entries, ...(await logActivity(repos, now, "entry")) };
    });
  }
}
