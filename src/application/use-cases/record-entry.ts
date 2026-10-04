import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { sharesFor, type SplitMode } from "@/domain/split";
import { assertKnownPeople } from "../known-people";
import { resolveWallet } from "../known-wallets";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, EntrySource, TransactionRunner } from "../ports";

export interface RecordEntryInput {
  kind: "expense" | "income";
  total: Satang;
  occurredAt?: Date;
  categoryId?: string | null;
  note?: string | null;
  merchant?: string | null;
  source?: EntrySource;
  /** Default: the default wallet. */
  walletId?: string | null;
  /** Only meaningful for expenses ("ออกก่อน"). */
  split?: SplitMode;
}

export type RecordEntryOutput = ActivityResult & { entry: EntryRecord };

export class RecordEntry {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecordEntryInput): Promise<RecordEntryOutput> {
    assertSatang(input.total);
    if (input.total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
    if (input.kind === "income" && input.split && input.split.kind !== "none") {
      throw new DomainError("INVALID_SPLIT", "only expenses can be fronted");
    }
    const now = this.clock.now();
    const shares = sharesFor(input.total, input.split ?? { kind: "none" });

    return this.tx.run(async (repos) => {
      await assertKnownPeople(repos.people, shares.map((s) => s.personId));
      const walletId = await resolveWallet(repos.wallets, input.walletId);
      const entry = await repos.entries.insert({
        kind: input.kind,
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        total: input.total,
        shares,
        personId: null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        merchant: input.merchant ?? null,
        source: input.source ?? "manual",
        walletId,
        toWalletId: null,
      });
      return { entry, ...(await logActivity(repos, now, "entry")) };
    });
  }
}
