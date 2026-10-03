import { allocateToBillTotal } from "@/domain/allocate";
import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { partnerShareOfLines, type Owner } from "@/domain/split";
import { logActivity } from "../log-activity";
import type { Clock, EntryRecord, TransactionRunner } from "../ports";
import type { ActivityResult } from "../log-activity";

export interface SaveReceiptInput {
  merchant?: string | null;
  occurredAt?: Date;
  /** Final amount paid; lines are scaled to add up to exactly this (discount / VAT allocation). */
  total: Satang;
  lines: {
    rawName: string;
    canonicalName: string;
    qty: number;
    price: Satang;
    owner: Owner;
    categoryId?: string | null;
    lowConfidence?: boolean;
  }[];
}

export type SaveReceiptOutput = ActivityResult & { entry: EntryRecord };

/** One receipt = one expense entry that carries its lines. */
export class SaveReceiptEntry {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveReceiptInput): Promise<SaveReceiptOutput> {
    assertSatang(input.total);
    if (input.total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
    if (input.lines.length === 0) throw new DomainError("INVALID_RECEIPT", "a receipt needs at least one line");
    input.lines.forEach((l) => {
      if (!Number.isInteger(l.qty) || l.qty < 1) throw new DomainError("INVALID_RECEIPT", "bad quantity");
    });

    const prices = allocateToBillTotal(input.lines.map((l) => l.price), input.total);
    const lines = input.lines.map((l, i) => ({
      rawName: l.rawName,
      canonicalName: l.canonicalName.trim(),
      qty: l.qty,
      price: prices[i],
      owner: l.owner,
      categoryId: l.categoryId ?? null,
      lowConfidence: l.lowConfidence ?? false,
    }));
    const now = this.clock.now();

    return this.tx.run(async (repos) => {
      const entry = await repos.entries.insert({
        kind: "expense",
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        total: input.total,
        partnerShare: partnerShareOfLines(lines),
        categoryId: null, // per-line categories live on the lines
        note: null,
        merchant: input.merchant ?? null,
        source: "receipt",
      });
      await repos.receiptLines.insertMany(entry.id, lines);
      // What the user saved is what the AI should remember next time.
      await repos.ownerMemory.upsertMany(
        lines.map((l) => ({ canonicalName: l.canonicalName, owner: l.owner })),
        now,
      );
      return { entry, ...(await logActivity(repos, now, "entry")) };
    });
  }
}
