import { bangkokDay } from "@/domain/day";
import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { sharesFor, type SplitMode } from "@/domain/split";
import { assertKnownPeople } from "../known-people";
import { resolveWallet } from "../known-wallets";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, EntryRecord, EntrySource, PresetRepo, Repos, TransactionRunner } from "../ports";

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
  /** The preset it was logged from: feeds that preset's price history. */
  presetId?: string | null;
}

export type RecordEntryOutput = ActivityResult & { entry: EntryRecord };

/**
 * Checks and saves one entry inside a transaction that is already open. No streak / XP: the caller
 * decides when pressing save counts as a log (once per press, however many entries it saved).
 */
export async function insertEntry(repos: Repos, input: RecordEntryInput, now: Date): Promise<EntryRecord> {
  assertSatang(input.total);
  if (input.total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
  if (input.kind === "income" && input.split && input.split.kind !== "none") {
    throw new DomainError("INVALID_SPLIT", "only expenses can be fronted");
  }
  // Any time today is fine (a day picked on the calendar is logged at noon); a later day is not.
  if (input.occurredAt && bangkokDay(input.occurredAt) > bangkokDay(now)) {
    throw new DomainError("INVALID_DATE", "an entry can't happen on a future day");
  }
  const shares = sharesFor(input.total, input.split ?? { kind: "none" });
  await assertKnownPeople(repos.people, shares.map((s) => s.personId));
  const walletId = await resolveWallet(repos.wallets, input.walletId);
  return repos.entries.insert({
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
    presetId: input.presetId ?? null,
  });
}

export class RecordEntry {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
    private readonly presets?: Pick<PresetRepo, "list">,
  ) {}

  async execute(input: RecordEntryInput): Promise<RecordEntryOutput> {
    const now = this.clock.now();
    if (input.presetId && !(await this.presets?.list())?.some((p) => p.id === input.presetId)) {
      throw new DomainError("UNKNOWN_PRESET", "no such preset");
    }
    return this.tx.run(async (repos) => {
      const entry = await insertEntry(repos, input, now);
      return { entry, ...(await logActivity(repos, now, "entry")) };
    });
  }
}
