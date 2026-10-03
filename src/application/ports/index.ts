import type { DayKey } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { LayoutItem } from "@/domain/dashboard-layout";
import type { PartnerExpense, Repayment } from "@/domain/partner";
import type { Owner } from "@/domain/split";

export interface Clock {
  now(): Date;
}

export type EntrySource = "manual" | "preset" | "receipt" | "wheel";

export interface NewEntry {
  kind: "expense" | "income" | "repayment";
  occurredAt: Date;
  createdAt: Date;
  total: Satang;
  partnerShare: Satang;
  categoryId: string | null;
  note: string | null;
  merchant: string | null;
  source: EntrySource;
}

export interface EntryRecord extends NewEntry {
  id: string;
}

export interface EntryRepo {
  insert(entry: NewEntry): Promise<EntryRecord>;
  partnerLedger(): Promise<{ expenses: PartnerExpense[]; repayments: Repayment[] }>;
  recent(limit: number): Promise<EntryRecord[]>;
  /** Entries that happened on a Bangkok calendar day, newest first. */
  onDay(day: DayKey): Promise<EntryRecord[]>;
  findById(id: string): Promise<EntryRecord | null>;
  update(
    id: string,
    patch: Partial<Pick<EntryRecord, "occurredAt" | "total" | "partnerShare" | "categoryId" | "note" | "merchant">>,
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
  owner: Owner;
  categoryId: string | null;
  lowConfidence: boolean;
}
export interface ReceiptLineRepo {
  insertMany(entryId: string, lines: NewReceiptLine[]): Promise<void>;
}

export interface OwnerMemoryRepo {
  /** canonicalName -> the owner the user last chose for it. */
  all(): Promise<Map<string, Owner>>;
  upsertMany(items: { canonicalName: string; owner: Owner }[], at: Date): Promise<void>;
}

export interface Repos {
  entries: EntryRepo;
  loggedDays: LoggedDayRepo;
  xp: XpRepo;
  receiptLines: ReceiptLineRepo;
  ownerMemory: OwnerMemoryRepo;
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
  owner: Owner;
  /** false => the guess is weak; the UI highlights the line. */
  confident: boolean;
}
export interface ParsedReceipt {
  merchant: string | null;
  /** ISO date (YYYY-MM-DD) if readable. */
  date: string | null;
  /** Final amount actually paid. */
  total: Satang;
  lines: ParsedReceiptLine[];
}
export interface ReceiptParser {
  parse(
    image: { data: Uint8Array; mimeType: string },
    context: { partnerNote: string; knownNames: string[]; categoryNames: string[] },
  ): Promise<ParsedReceipt>;
}

export interface DailyTotal {
  day: DayKey;
  /** Our own spending only: partner's share is excluded. */
  spent: Satang;
  earned: Satang;
}

/** Read-side aggregates. Implemented with raw SQL for speed (dashboard / calendar). */
export interface StatsRepo {
  /** Per Bangkok day in [from, toExclusive), only days that have entries. */
  dailyTotals(from: DayKey, toExclusive: DayKey): Promise<DailyTotal[]>;
  /** (day, kind) of logged days in [from, toExclusive). */
  loggedKinds(from: DayKey, toExclusive: DayKey): Promise<{ day: DayKey; kind: "entry" | "no_spend" }[]>;
  /** Our own spending per category in [from, toExclusive); receipts count by their lines. categoryId null = uncategorised. */
  categoryTotals(from: DayKey, toExclusive: DayKey): Promise<{ categoryId: string | null; spent: Satang }[]>;
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
  partnerMode: "split" | "partnerAll" | null;
  sort: number;
}
export interface PresetRepo {
  list(): Promise<PresetRecord[]>;
  create(p: Omit<PresetRecord, "id">): Promise<PresetRecord>;
  update(id: string, patch: Partial<Omit<PresetRecord, "id">>): Promise<PresetRecord | null>;
  remove(id: string): Promise<boolean>;
}

export interface SettingsRecord {
  partnerNote: string;
  dashboardLayout: LayoutItem[];
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

/** Checks the single configured account. Must take the same time for a wrong email as for a wrong password. */
export interface CredentialVerifier {
  verify(email: string, password: string): Promise<boolean>;
}
