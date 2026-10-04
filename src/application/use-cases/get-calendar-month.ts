import { monthDays, type DayKey } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { StatsRepo } from "../ports";

export interface CalendarDay {
  day: DayKey;
  spent: Satang;
  earned: Satang;
  /** How the day was logged (by pressing log), or null. */
  logged: "entry" | "no_spend" | null;
}

export interface CalendarMonth {
  month: string;
  days: CalendarDay[];
  totals: { spent: Satang; earned: Satang; net: Satang };
  /** Largest daily spend, for the heatmap scale. */
  maxSpent: Satang;
}

export class GetCalendarMonth {
  constructor(private readonly stats: StatsRepo) {}

  async execute(month: string, walletId?: string): Promise<CalendarMonth> {
    const { days, nextMonthStart } = monthDays(month);
    const [totals, kinds] = await Promise.all([
      this.stats.dailyTotals(days[0], nextMonthStart, walletId),
      this.stats.loggedKinds(days[0], nextMonthStart),
    ]);
    const byDay = new Map(totals.map((t) => [t.day, t]));
    const kindOf = new Map(kinds.map((k) => [k.day, k.kind]));
    const out: CalendarDay[] = days.map((day) => ({
      day,
      spent: byDay.get(day)?.spent ?? 0,
      earned: byDay.get(day)?.earned ?? 0,
      logged: kindOf.get(day) ?? null,
    }));
    const spent = out.reduce((s, d) => s + d.spent, 0);
    const earned = out.reduce((s, d) => s + d.earned, 0);
    return {
      month,
      days: out,
      totals: { spent, earned, net: earned - spent },
      maxSpent: Math.max(0, ...out.map((d) => d.spent)),
    };
  }
}
