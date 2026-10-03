import type { DayKey } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { PartnerExpense, Repayment } from "@/domain/partner";

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

export interface Repos {
  entries: EntryRepo;
  loggedDays: LoggedDayRepo;
  xp: XpRepo;
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
