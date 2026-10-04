import { allocateToBillTotal } from "@/domain/allocate";
import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { assertLineOwners, sharesOfLines, type LineOwners } from "@/domain/split";
import { assertKnownPeople } from "../known-people";
import { resolveWallet } from "../known-wallets";
import { logActivity } from "../log-activity";
import type { Clock, EntryRecord, NewReceiptLine, Repos, TransactionRunner } from "../ports";
import type { ActivityResult } from "../log-activity";

export interface SaveReceiptInput {
  /** A scanned receipt, or a group of items typed by hand ("ค่า 7-11": นม, ไก่ ...). Default: receipt. */
  source?: "receipt" | "itemized";
  /** Shop name, or the group's own name for a hand-typed group. */
  merchant?: string | null;
  occurredAt?: Date;
  /** Final amount paid; lines are scaled to add up to exactly this (discount / VAT allocation). */
  total: Satang;
  /** Default: the default wallet. */
  walletId?: string | null;
  /** Who shares this bill. Default: everyone named on a line. Empty = all ours (a plain scan). */
  people?: string[];
  lines: {
    rawName: string;
    canonicalName: string;
    qty: number;
    price: Satang;
    owners: LineOwners;
    categoryId?: string | null;
    lowConfidence?: boolean;
  }[];
}

export type SaveReceiptOutput = ActivityResult & { entry: EntryRecord };

/** One group (receipt or hand-typed) = one expense entry that carries its lines. */
export class SaveReceiptEntry {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveReceiptInput): Promise<SaveReceiptOutput> {
    const now = this.clock.now();
    return this.tx.run(async (repos) => {
      const entry = await insertGroup(repos, input, now);
      return { entry, ...(await logActivity(repos, now, "entry")) };
    });
  }
}

/**
 * Checks and saves one group inside a transaction that is already open. No streak / XP: the caller
 * decides when pressing save counts as a log.
 */
export async function insertGroup(repos: Repos, input: SaveReceiptInput, now: Date): Promise<EntryRecord> {
  const { people, lines } = prepareGroup(input);
  await assertKnownPeople(repos.people, people);
  const walletId = await resolveWallet(repos.wallets, input.walletId);
  const entry = await repos.entries.insert({
    kind: "expense",
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    total: input.total,
    shares: sharesOfLines(lines),
    personId: null,
    categoryId: null, // per-line categories live on the lines
    note: null,
    merchant: input.merchant ?? null,
    source: input.source ?? "receipt",
    walletId,
    toWalletId: null,
  });
  await repos.receiptLines.insertMany(entry.id, lines);
  await rememberOwners(repos, people, lines, now);
  return entry;
}

/** Checks a group's lines and scales them to the paid total. Shared by saving and editing a group. */
export function prepareGroup(input: Pick<SaveReceiptInput, "total" | "people" | "lines">): {
  people: Set<string>;
  lines: NewReceiptLine[];
} {
  assertSatang(input.total);
  if (input.total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
  if (input.lines.length === 0) throw new DomainError("INVALID_RECEIPT", "a receipt needs at least one line");
  input.lines.forEach((l) => {
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new DomainError("INVALID_RECEIPT", "bad quantity");
    assertLineOwners(l.owners);
  });
  const named = new Set(input.lines.flatMap((l) => l.owners.people));
  const people = new Set(input.people ?? named);
  for (const id of named) {
    if (!people.has(id)) throw new DomainError("INVALID_SPLIT", "a line names someone who isn't on the bill");
  }

  const prices = allocateToBillTotal(input.lines.map((l) => l.price), input.total);
  const lines = input.lines.map((l, i) => ({
    rawName: l.rawName,
    canonicalName: l.canonicalName.trim(),
    qty: l.qty,
    price: prices[i],
    owners: l.owners,
    categoryId: l.categoryId ?? null,
    lowConfidence: l.lowConfidence ?? false,
  }));
  return { people, lines };
}

/**
 * What the user saved is what the AI should remember next time. Only bills shared with someone
 * teach: a plain scan says nothing about who things are for. And a choice made without the person
 * we remember (say นมเปรี้ยว -> แฟน, on a bill without แฟน) doesn't overwrite what we know.
 */
export async function rememberOwners(repos: Repos, people: Set<string>, lines: NewReceiptLine[], now: Date) {
  if (people.size === 0) return;
  const known = await repos.ownerMemory.all();
  await repos.ownerMemory.upsertMany(
    lines
      .filter((l) => (known.get(l.canonicalName)?.people ?? []).every((id) => people.has(id)))
      .map((l) => ({ canonicalName: l.canonicalName, owners: l.owners })),
    now,
  );
}
