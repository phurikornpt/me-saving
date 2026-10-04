import { balances, outstandingByEntry, type OutstandingItem } from "@/domain/ledger";
import type { Satang } from "@/domain/money";
import { lineShares } from "@/domain/split";
import type { EntrySource, Repos } from "../ports";

/** One line of a group entry that this person pays part of. */
export interface OwedLine {
  name: string;
  qty: number;
  /** Their part of the line. */
  amount: Satang;
  /** How many people the line is divided between (us included), 1 = all theirs. */
  parts: number;
}

export interface OwedItem extends OutstandingItem {
  /** Shop or group name, else the note. Null = only the category says what it was. */
  title: string | null;
  categoryId: string | null;
  source: EntrySource;
  /** Group entries only: the lines this person shares. */
  lines: OwedLine[];
}

export interface PersonOutstanding {
  personId: string;
  balance: Satang;
  items: OwedItem[];
}

/** Everyone who still owes us something, biggest balance first, with what each entry was for. */
export class GetOutstanding {
  constructor(private readonly repos: Repos) {}

  async execute(): Promise<PersonOutstanding[]> {
    const ledger = await this.repos.entries.ledger();
    const owing = [...balances(ledger)]
      .filter(([, balance]) => balance > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([personId, balance]) => ({ personId, balance, items: outstandingByEntry(ledger, personId) }));

    const ids = [...new Set(owing.flatMap((o) => o.items.map((i) => i.entryId)))];
    const [entries, lines] = await Promise.all([
      this.repos.entries.findByIds(ids),
      this.repos.receiptLines.listByEntries(ids),
    ]);
    const byId = new Map(entries.map((e) => [e.id, e]));

    return owing.map((o) => ({
      ...o,
      items: o.items.map((i): OwedItem => {
        const e = byId.get(i.entryId);
        return {
          ...i,
          title: e?.merchant?.trim() || e?.note?.trim() || null,
          categoryId: e?.categoryId ?? null,
          source: e?.source ?? "manual",
          lines: (lines.get(i.entryId) ?? []).flatMap((l) => {
            const part = lineShares(l.price, l.owners).find((s) => s.personId === o.personId);
            if (!part) return [];
            const parts = l.owners.people.length + (l.owners.me ? 1 : 0);
            return [{ name: l.canonicalName || l.rawName, qty: l.qty, amount: part.amount, parts }];
          }),
        };
      }),
    }));
  }
}
