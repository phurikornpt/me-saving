import type { DayKey } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { EntryRepo } from "../ports";

export interface CandidateRow {
  day: DayKey;
  total: Satang;
  kind: "expense" | "income";
  description: string;
}

const MAX_DAYS = 60;

/**
 * Which rows of a batch we probably already have: same day, kind and amount as an entry on file,
 * or the exact same row listed earlier in the same batch (overlapping screenshots).
 * Only a hint for the review screen: nothing is blocked.
 */
export class FindDuplicates {
  constructor(private readonly entries: Pick<EntryRepo, "onDay">) {}

  async execute(rows: CandidateRow[]): Promise<boolean[]> {
    const days = [...new Set(rows.map((r) => r.day))].slice(0, MAX_DAYS);
    const onFile = new Map<DayKey, Set<string>>();
    await Promise.all(
      days.map(async (day) => {
        const found = await this.entries.onDay(day);
        onFile.set(day, new Set(found.map((e) => `${e.kind}|${e.total}`)));
      }),
    );
    const seen = new Set<string>();
    return rows.map((r) => {
      const sameInBatch = `${r.day}|${r.kind}|${r.total}|${r.description.trim().toLowerCase()}`;
      const dup = seen.has(sameInBatch) || (onFile.get(r.day)?.has(`${r.kind}|${r.total}`) ?? false);
      seen.add(sameInBatch);
      return dup;
    });
  }
}
