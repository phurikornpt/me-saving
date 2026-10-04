import type { DayKey } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { LayoutItem } from "@/domain/dashboard-layout";
import type { Ledger } from "@/domain/ledger";
import type { LineOwners, Share } from "@/domain/split";
import type { SpendFilter } from "@/domain/spend-filter";
import type { EntryKind } from "@/domain/wallet";

export interface Clock {
  now(): Date;
}

export type EntrySource = "manual" | "preset" | "receipt" | "itemized" | "wheel";

/** Group entries (a scanned receipt, or several items typed by hand) get their amount and split from their lines. */
export const isGroupSource = (s: EntrySource) => s === "receipt" || s === "itemized";

export interface NewEntry {
  kind: EntryKind;
  occurredAt: Date;
  createdAt: Date;
  total: Satang;
  /** What each person owes us for this entry. Expenses only; empty when it's all ours. */
  shares: Share[];
  /** Who paid us back. Repayments only. */
  personId: string | null;
  categoryId: string | null;
  note: string | null;
  merchant: string | null;
  source: EntrySource;
  /** Where the money left from (expense, transfer) or arrived in (income, repayment). */
  walletId: string;
  /** Where a transfer's money went. Transfers only. */
  toWalletId: string | null;
  /** The preset it was logged from, if any (its price history). */
  presetId?: string | null;
}

export interface EntryRecord extends NewEntry {
  id: string;
  /** Sum of `shares`: the part of the total that isn't ours. */
  othersShare: Satang;
}

export interface EntryRepo {
  insert(entry: NewEntry): Promise<EntryRecord>;
  /** Every person's shares and repayments. */
  ledger(): Promise<Ledger>;
  /** Newest first. With `walletId`: only entries that moved money in or out of that wallet (transfers both ways). */
  recent(limit: number, walletId?: string): Promise<EntryRecord[]>;
  /** Entries that happened on a Bangkok calendar day, newest first. */
  onDay(day: DayKey): Promise<EntryRecord[]>;
  findById(id: string): Promise<EntryRecord | null>;
  findByIds(ids: string[]): Promise<EntryRecord[]>;
  update(
    id: string,
    patch: Partial<
      Pick<NewEntry, "occurredAt" | "total" | "shares" | "categoryId" | "note" | "merchant" | "walletId" | "toWalletId">
    >,
  ): Promise<EntryRecord | null>;
  remove(id: string): Promise<boolean>;
}

export interface LoggedDayRepo {
  has(day: DayKey): Promise<boolean>;
  add(day: DayKey, kind: "entry" | "no_spend", at: Date): Promise<void>;
  allDays(): Promise<DayKey[]>;
}

export interface XpRepo {
  add(reason: string, amount: number, at: Date): Promise<void>;
  total(): Promise<number>;
  /** XP already earned today from extra entries (for the daily cap). */
  extraEntryXpOnDay(day: DayKey): Promise<number>;
}

export interface NewReceiptLine {
  rawName: string;
  canonicalName: string;
  qty: number;
  /** Satang, after bill-level discount / VAT have been allocated onto the line. */
  price: Satang;
  owners: LineOwners;
  categoryId: string | null;
  lowConfidence: boolean;
}
export interface ReceiptLineRepo {
  insertMany(entryId: string, lines: NewReceiptLine[]): Promise<void>;
  /** Swaps a group's lines for new ones (editing a group). */
  replace(entryId: string, lines: NewReceiptLine[]): Promise<void>;
  /** Each group entry's lines in their saved order. Entries without lines are absent. */
  listByEntries(entryIds: string[]): Promise<Map<string, NewReceiptLine[]>>;
}

export interface OwnerMemoryRepo {
  /** canonicalName -> who the user last said the item was for. */
  all(): Promise<Map<string, LineOwners>>;
  upsertMany(items: { canonicalName: string; owners: LineOwners }[], at: Date): Promise<void>;
}

/** Someone we front money for. Not a login: just a name the user sets up, plus a note for the AI. */
export interface PersonRecord {
  id: string;
  name: string;
  /** Free text about what they like or use; sent to the AI when a bill is split with them. */
  note: string;
  sort: number;
  archived: boolean;
}
export interface PersonRepo {
  list(): Promise<PersonRecord[]>;
  create(p: Pick<PersonRecord, "name" | "note" | "sort">): Promise<PersonRecord>;
  update(id: string, patch: Partial<Omit<PersonRecord, "id">>): Promise<PersonRecord | null>;
}

/** Where money sits (cash, a bank account, a card). Set up by the user; archived, never deleted. */
export interface WalletRecord {
  id: string;
  name: string;
  icon: string;
  /** What was in it before the first entry. May be negative (a credit card). */
  openingBalance: Satang;
  sort: number;
  archived: boolean;
}
export interface WalletRepo {
  list(): Promise<WalletRecord[]>;
  create(w: Pick<WalletRecord, "name" | "icon" | "openingBalance" | "sort">): Promise<WalletRecord>;
  update(id: string, patch: Partial<Omit<WalletRecord, "id">>): Promise<WalletRecord | null>;
  /** Money in minus money out per wallet, over every entry (see domain walletDeltas). */
  netFlows(): Promise<Map<string, Satang>>;
  /** The wallet new entries go to when none is picked: the chosen default if still active, else the first active one. */
  defaultId(): Promise<string | null>;
  setDefault(id: string | null): Promise<void>;
}

export interface Repos {
  entries: EntryRepo;
  wallets: WalletRepo;
  loggedDays: LoggedDayRepo;
  xp: XpRepo;
  receiptLines: ReceiptLineRepo;
  ownerMemory: OwnerMemoryRepo;
  people: PersonRepo;
}

/** What the AI read off a receipt. Amounts are satang; names are kept verbatim as printed. */
export interface ParsedReceiptLine {
  rawName: string;
  /** Short human name ("นมเปรี้ยว"), reusing known names when they fit. */
  canonicalName: string;
  qty: number;
  /** Line total as printed (may still include bill-level discount / VAT effects). */
  price: Satang;
  categoryName: string | null;
  /** Person ids are the ones passed in `people`. Always "me" when no one shares the bill. */
  owners: LineOwners;
  /** false => the guess is weak; the UI highlights the line. */
  confident: boolean;
}
/** What the picture turned out to be. `unknown` never leaves the parser: it becomes INVALID_RECEIPT. */
export type ImageKind = "receipt" | "delivery" | "online_order" | "transfer_slip" | "history";
/** One row of a bank / e-wallet history page. */
export interface ParsedTransaction {
  /** ISO date if the row (or its day header) shows one. */
  date: string | null;
  description: string;
  /** Always positive; `direction` says which way the money went. */
  amount: Satang;
  direction: "out" | "in";
  categoryName: string | null;
}
/** A bill-level charge that is not a product (delivery, service fee, tip ...), in satang. */
export interface ParsedFee {
  name: string;
  amount: Satang;
}
export interface ParsedReceipt {
  kind: ImageKind;
  /** Shop name; for a transfer slip, who the money went to. */
  merchant: string | null;
  /** ISO date (YYYY-MM-DD) if readable. */
  date: string | null;
  /** Final amount actually paid. */
  total: Satang;
  lines: ParsedReceiptLine[];
  /** Delivery / service fees etc. Discounts are never fees: they are already inside `total`. */
  fees: ParsedFee[];
  /** Only for kind "history", where `lines` is empty. */
  transactions?: ParsedTransaction[];
}
export interface ReceiptParser {
  parse(
    image: { data: Uint8Array; mimeType: string },
    context: {
      /** Who shares this bill. Empty = just read the lines (no guessing who each is for). */
      people: Pick<PersonRecord, "id" | "name" | "note">[];
      /** The buyer's own habits. Only sent when people share the bill. */
      meNote?: string;
      knownNames: string[];
      categoryNames: string[];
    },
  ): Promise<ParsedReceipt>;
}

/**
 * What the AI made of one sentence ("ข้าวมันไก่ 60 หารแฟน"). People and wallets are the short keys we
 * handed out (p1, w1 ...), never ids; the use case maps them back and drops anything it didn't give.
 */
export interface ParsedEntryText {
  kind: "expense" | "income";
  /** Satang; null when no amount was said. */
  amount: Satang | null;
  categoryName: string | null;
  note: string | null;
  /** How an expense is split with `personKeys`. Always "none" for income. */
  split: "none" | "equal" | "theirs";
  personKeys: string[];
  walletKey: string | null;
  /** Fields the model is unsure about. */
  uncertain: ("amount" | "category" | "person" | "wallet")[];
}
export interface TextEntryParser {
  parse(
    text: string,
    context: {
      categories: { name: string; kind: "expense" | "income" }[];
      people: { key: string; name: string; note: string }[];
      wallets: { key: string; name: string }[];
    },
  ): Promise<ParsedEntryText>;
}

export interface DailyTotal {
  day: DayKey;
  /** Our own spending only: other people's shares are excluded. */
  spent: Satang;
  earned: Satang;
}

/** Read-side aggregates. Implemented with raw SQL for speed (dashboard / calendar). */
export interface StatsRepo {
  /**
   * Per Bangkok day in [from, toExclusive), only days that have entries. `walletId`: only that wallet's entries.
   * `spend` "mine" / "fronted": only expenses with no one else's share / with someone else's share, at their full
   * amount, and no income.
   */
  dailyTotals(from: DayKey, toExclusive: DayKey, walletId?: string, spend?: SpendFilter): Promise<DailyTotal[]>;
  /** (day, kind) of logged days in [from, toExclusive). */
  loggedKinds(from: DayKey, toExclusive: DayKey): Promise<{ day: DayKey; kind: "entry" | "no_spend" }[]>;
  /** Our own spending per category in [from, toExclusive); receipts count by their lines. categoryId null = uncategorised. */
  categoryTotals(from: DayKey, toExclusive: DayKey, walletId?: string): Promise<{ categoryId: string | null; spent: Satang }[]>;
}

export interface CategoryRecord {
  id: string;
  name: string;
  icon: string;
  kind: "expense" | "income";
  sort: number;
  archived: boolean;
}
export interface CategoryRepo {
  list(): Promise<CategoryRecord[]>;
  create(c: Omit<CategoryRecord, "id" | "archived">): Promise<CategoryRecord>;
  update(id: string, patch: Partial<Omit<CategoryRecord, "id" | "kind">>): Promise<CategoryRecord | null>;
}

export interface PresetRecord {
  id: string;
  label: string;
  icon: string;
  amount: Satang;
  categoryId: string | null;
  /** A fronted preset: who it's for and how it splits. Both null = all ours. */
  personId: string | null;
  splitKind: "equal" | "theirs" | null;
  /** null = the default wallet at the time of the tap. */
  walletId: string | null;
  sort: number;
}
/** One price a preset was logged at: how often, and when last. */
export interface PresetPrice {
  amount: Satang;
  count: number;
  lastAt: Date;
}

export interface PresetRepo {
  list(): Promise<PresetRecord[]>;
  /** The amounts this preset's expenses were logged at since `since`, most used first. */
  prices(presetId: string, since: Date): Promise<PresetPrice[]>;
  create(p: Omit<PresetRecord, "id">): Promise<PresetRecord>;
  update(id: string, patch: Partial<Omit<PresetRecord, "id">>): Promise<PresetRecord | null>;
  remove(id: string): Promise<boolean>;
}

export interface SettingsRecord {
  dashboardLayout: LayoutItem[];
  /** The buyer's own habits, for the receipt AI on shared bills. */
  meNote: string;
}
export interface SettingsRepo {
  get(): Promise<SettingsRecord>;
  update(patch: Partial<SettingsRecord>): Promise<SettingsRecord>;
}

/** Runs `fn` in one transaction; every repo passed in shares it. */
export interface TransactionRunner {
  run<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
}

export interface LoginAttemptRepo {
  countSince(key: string, since: Date): Promise<number>;
  record(key: string, at: Date): Promise<void>;
  clear(key: string): Promise<void>;
}

/** Checks an account's password. Must take the same time for a wrong email as for a wrong password. */
export interface CredentialVerifier {
  /** The account id, or null when the email or password is wrong. */
  verify(email: string, password: string): Promise<string | null>;
}

/** Aggregates of one month for the plain-language summary. Money is satang; no entry, note, merchant or person ever goes in. */
export interface MonthFacts {
  /** "YYYY-MM" */
  month: string;
  /** Days counted: the whole month, or 1st..today while it is unfinished (then the previous month is cut at the same day too). */
  daysCovered: number;
  loggedDays: number;
  noSpendDays: number;
  /** Our own spending over `daysCovered`, and the previous month over the same span. */
  spent: Satang;
  prevSpent: Satang;
  /** Change vs the previous month in whole percent (computed in code); null when the previous month had no spending. */
  changePct: number | null;
  /** Largest categories first. */
  categories: { name: string; spent: Satang; prevSpent: Satang; changePct: number | null; sharePct: number }[];
}
export interface MonthSummarizer {
  /** About three short Thai lines phrased from the facts. Throws AI_UNAVAILABLE when the model fails. */
  summarize(facts: MonthFacts): Promise<string>;
}

export interface MonthlySummaryRecord {
  month: string;
  text: string;
  createdAt: Date;
}
/** Stored summaries, one per month (the cache that keeps the AI to one call per month). */
export interface SummaryRepo {
  get(month: string): Promise<MonthlySummaryRecord | null>;
  /** Replaces the month's summary. */
  save(month: string, text: string, at: Date): Promise<void>;
}
