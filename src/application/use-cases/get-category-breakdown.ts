import { monthDays } from "@/domain/day";
import type { Satang } from "@/domain/money";
import type { CategoryRepo, StatsRepo } from "../ports";

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  icon: string;
  spent: Satang;
}

export interface CategoryBreakdown {
  month: string;
  /** Our own spending in the month, largest category first. */
  total: Satang;
  slices: CategorySlice[];
}

export class GetCategoryBreakdown {
  constructor(
    private readonly stats: StatsRepo,
    private readonly categories: CategoryRepo,
  ) {}

  async execute(month: string): Promise<CategoryBreakdown> {
    const { days, nextMonthStart } = monthDays(month);
    const [totals, cats] = await Promise.all([this.stats.categoryTotals(days[0], nextMonthStart), this.categories.list()]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    const slices = totals.map((t): CategorySlice => {
      const c = t.categoryId ? byId.get(t.categoryId) : undefined; // archived categories still count in past months
      return { categoryId: t.categoryId, name: c?.name ?? "ไม่ระบุหมวด", icon: c?.icon ?? "more_horiz", spent: t.spent };
    });
    return { month, total: slices.reduce((s, x) => s + x.spent, 0), slices };
  }
}
