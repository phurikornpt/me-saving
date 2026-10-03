import type { DayKey } from "@/domain/day";
import type { EntryRecord, Repos } from "../ports";

export class ListEntries {
  constructor(private readonly repos: Repos) {}

  execute(q: { day?: DayKey; limit?: number }): Promise<EntryRecord[]> {
    if (q.day) return this.repos.entries.onDay(q.day);
    return this.repos.entries.recent(Math.min(Math.max(q.limit ?? 20, 1), 100));
  }
}
