import { bangkokDay, type DayKey } from "@/domain/day";
import type { PartnerExpense, Repayment } from "@/domain/partner";
import type { Owner } from "@/domain/split";
import type {
  Clock,
  EntryRecord,
  NewEntry,
  NewReceiptLine,
  Repos,
  TransactionRunner,
} from "../ports";

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now() {
    return this.current;
  }
}

export function createFakeRepos() {
  const entries: EntryRecord[] = [];
  const days = new Map<DayKey, "entry" | "no_spend">();
  const xp: { reason: string; amount: number; at: Date }[] = [];
  const lines: (NewReceiptLine & { entryId: string })[] = [];
  const memory = new Map<string, Owner>();
  let seq = 0;

  const repos: Repos = {
    receiptLines: undefined as never,
    ownerMemory: undefined as never,
    entries: {
      async insert(e: NewEntry) {
        const rec = { ...e, id: `e${++seq}` };
        entries.push(rec);
        return rec;
      },
      async partnerLedger() {
        const expenses: PartnerExpense[] = entries
          .filter((e) => e.kind === "expense" && e.partnerShare > 0)
          .map((e) => ({ id: e.id, occurredAt: e.occurredAt, partnerShare: e.partnerShare }));
        const repayments: Repayment[] = entries
          .filter((e) => e.kind === "repayment")
          .map((e) => ({ total: e.total }));
        return { expenses, repayments };
      },
      async recent(limit) {
        return [...entries].reverse().slice(0, limit);
      },
    },
    loggedDays: {
      async has(day) {
        return days.has(day);
      },
      async add(day, kind) {
        days.set(day, kind);
      },
      async allDays() {
        return [...days.keys()];
      },
    },
    xp: {
      async add(reason, amount, at) {
        xp.push({ reason, amount, at });
      },
      async total() {
        return xp.reduce((s, x) => s + x.amount, 0);
      },
      async extraEntryXpOnDay(day) {
        return xp
          .filter((x) => x.reason === "extra_entry" && bangkokDay(x.at) === day)
          .reduce((s, x) => s + x.amount, 0);
      },
    },
  };

  repos.receiptLines = {
    async insertMany(entryId, items) {
      items.forEach((l) => lines.push({ ...l, entryId }));
    },
  };
  repos.ownerMemory = {
    async all() {
      return new Map(memory);
    },
    async upsertMany(items) {
      items.forEach((i) => memory.set(i.canonicalName, i.owner));
    },
  };

  const tx: TransactionRunner = { run: (fn) => fn(repos) };
  return { repos, tx, entries, days, xp, lines, memory };
}
