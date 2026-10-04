import { addDays, bangkokDay, monthDays } from "@/domain/day";
import { spendAiCall, type AiLimit } from "../ai-budget";
import type { CategoryRepo, Clock, LoginAttemptRepo, MonthFacts, MonthSummarizer, StatsRepo, SummaryRepo } from "../ports";

export const EMPTY_MONTH_TEXT = "เดือนนี้ยังไม่มีรายจ่ายให้สรุป";
const TOP_CATEGORIES = 5;

export interface MonthSummary {
  month: string;
  text: string;
  /** When the AI wrote it. Null for the fixed "no spending" message. */
  generatedAt: Date | null;
}

const prevMonthOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const pctChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * A short plain-language summary of one month. Only per-category totals (ours, this month vs the last)
 * reach the model, and every percentage is worked out here: the model just phrases them.
 *
 * Cache rule: a finished month is written once and never regenerated; the unfinished current month is
 * regenerated at most once per Bangkok day. A cache hit costs no AI budget; a real call always does,
 * even when it fails. A month with no spending gets a fixed message without any AI call.
 */
export class GetMonthSummary {
  constructor(
    private readonly stats: StatsRepo,
    private readonly categories: CategoryRepo,
    private readonly summaries: SummaryRepo,
    private readonly summarizer: MonthSummarizer,
    /** Reuses the generic attempt log as the daily AI budget shared by every AI feature. */
    private readonly budget: LoginAttemptRepo,
    private readonly clock: Clock,
    private readonly limit: AiLimit,
  ) {}

  async execute(month: string): Promise<MonthSummary> {
    const now = this.clock.now();
    const today = bangkokDay(now);
    const currentMonth = today.slice(0, 7);
    const empty: MonthSummary = { month, text: EMPTY_MONTH_TEXT, generatedAt: null };
    if (month > currentMonth) return empty;

    const cached = await this.summaries.get(month);
    if (cached && (month < currentMonth || bangkokDay(cached.createdAt) === today)) {
      return { month, text: cached.text, generatedAt: cached.createdAt };
    }

    const facts = await this.factsFor(month, month === currentMonth ? today : null);
    if (facts.spent === 0) return empty;

    await spendAiCall(this.budget, this.clock, this.limit);
    const text = await this.summarizer.summarize(facts);
    await this.summaries.save(month, text, now);
    return { month, text, generatedAt: now };
  }

  /** `today` is set while the month is unfinished: both months are then cut at the same day of the month. */
  private async factsFor(month: string, today: string | null): Promise<MonthFacts> {
    const { days, nextMonthStart } = monthDays(month);
    const daysCovered = today ? Number(today.slice(8)) : days.length;
    const to = today ? addDays(today, 1) : nextMonthStart;
    const prev = prevMonthOf(month);
    const prevFrom = `${prev}-01`;
    const prevTo = today ? addDays(prevFrom, Math.min(daysCovered, monthDays(prev).days.length)) : `${month}-01`;

    const [totals, prevTotals, logged, cats] = await Promise.all([
      this.stats.categoryTotals(days[0], to),
      this.stats.categoryTotals(prevFrom, prevTo),
      this.stats.loggedKinds(days[0], to),
      this.categories.list(),
    ]);
    const nameOf = new Map(cats.map((c) => [c.id, c.name]));
    const prevOf = new Map(prevTotals.map((t) => [t.categoryId, t.spent]));
    const spent = totals.reduce((s, t) => s + t.spent, 0);
    const prevSpent = prevTotals.reduce((s, t) => s + t.spent, 0);

    return {
      month,
      daysCovered,
      loggedDays: logged.length,
      noSpendDays: logged.filter((l) => l.kind === "no_spend").length,
      spent,
      prevSpent,
      changePct: pctChange(spent, prevSpent),
      categories: [...totals]
        .sort((a, b) => b.spent - a.spent)
        .slice(0, TOP_CATEGORIES)
        .map((t) => {
          const before = prevOf.get(t.categoryId) ?? 0;
          return {
            name: (t.categoryId && nameOf.get(t.categoryId)) || "ไม่ระบุหมวด",
            spent: t.spent,
            prevSpent: before,
            changePct: pctChange(t.spent, before),
            sharePct: Math.round((t.spent / spent) * 100),
          };
        }),
    };
  }
}
