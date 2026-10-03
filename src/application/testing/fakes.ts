import { bangkokDay, type DayKey } from "@/domain/day";
import { sumShares, type LineOwners } from "@/domain/split";
import type {
  Clock,
  EntryRecord,
  NewEntry,
  NewReceiptLine,
  PersonRecord,
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
  const memory = new Map<string, LineOwners>();
  // Two people exist from the start so most tests can front money without setting anyone up.
  const people: PersonRecord[] = [
    { id: "p-fan", name: "แฟน", note: "ชอบนมเปรี้ยว", sort: 0, archived: false },
    { id: "p-a", name: "A", note: "", sort: 1, archived: false },
  ];
  let seq = 0;

  const repos: Repos = {
    receiptLines: undefined as never,
    ownerMemory: undefined as never,
    people: undefined as never,
    entries: {
      async insert(e: NewEntry) {
        const rec = { ...e, id: `e${++seq}`, othersShare: sumShares(e.shares) };
        entries.push(rec);
        return rec;
      },
      async ledger() {
        return {
          shares: entries.flatMap((e) =>
            e.shares.map((s) => ({ entryId: e.id, personId: s.personId, occurredAt: e.occurredAt, amount: s.amount })),
          ),
          repayments: entries
            .filter((e) => e.kind === "repayment")
            .map((e) => ({ personId: e.personId!, total: e.total })),
        };
      },
      async recent(limit) {
        return [...entries].reverse().slice(0, limit);
      },
      async onDay(day) {
        return entries.filter((e) => bangkokDay(e.occurredAt) === day);
      },
      async findById(id) {
        return entries.find((e) => e.id === id) ?? null;
      },
      async update(id, patch) {
        const i = entries.findIndex((e) => e.id === id);
        if (i < 0) return null;
        entries[i] = { ...entries[i], ...patch };
        entries[i].othersShare = sumShares(entries[i].shares);
        return entries[i];
      },
      async remove(id) {
        const i = entries.findIndex((e) => e.id === id);
        if (i < 0) return false;
        entries.splice(i, 1);
        return true;
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
      items.forEach((i) => memory.set(i.canonicalName, i.owners));
    },
  };
  repos.people = {
    async list() {
      return [...people];
    },
    async create(p) {
      const rec = { ...p, id: `p${++seq}`, archived: false };
      people.push(rec);
      return rec;
    },
    async update(id, patch) {
      const i = people.findIndex((p) => p.id === id);
      if (i < 0) return null;
      people[i] = { ...people[i], ...patch };
      return people[i];
    },
  };

  const tx: TransactionRunner = { run: (fn) => fn(repos) };
  return { repos, tx, entries, days, xp, lines, memory, people };
}
