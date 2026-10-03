import { addDays, bangkokDay, type DayKey } from "@/domain/day";
import type { LayoutItem } from "@/domain/dashboard-layout";
import type { Satang } from "@/domain/money";
import { partnerBalance } from "@/domain/partner";
import { computeStreak, type StreakState } from "@/domain/streak";
import { levelFromXp, type LevelState } from "@/domain/xp";
import type {
  Clock,
  EntryRecord,
  PresetRecord,
  PresetRepo,
  Repos,
  SettingsRepo,
  StatsRepo,
} from "../ports";

export interface DashboardView {
  today: DayKey;
  streak: StreakState;
  level: LevelState;
  xpTotal: number;
  partnerBalance: Satang;
  todayTotals: { spent: Satang; earned: Satang };
  recent: EntryRecord[];
  presets: PresetRecord[];
  layout: LayoutItem[];
  partnerNote: string;
}

/** One request feeds every widget; queries run in parallel. */
export class GetDashboard {
  constructor(
    private readonly repos: Repos,
    private readonly stats: StatsRepo,
    private readonly presets: PresetRepo,
    private readonly settings: SettingsRepo,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DashboardView> {
    const today = bangkokDay(this.clock.now());
    const [days, xpTotal, ledger, totals, recent, presets, settings] = await Promise.all([
      this.repos.loggedDays.allDays(),
      this.repos.xp.total(),
      this.repos.entries.partnerLedger(),
      this.stats.dailyTotals(today, addDays(today, 1)),
      this.repos.entries.recent(5),
      this.presets.list(),
      this.settings.get(),
    ]);
    const t = totals.find((x) => x.day === today);
    return {
      today,
      streak: computeStreak(days, today),
      level: levelFromXp(xpTotal),
      xpTotal,
      partnerBalance: partnerBalance(ledger.expenses, ledger.repayments),
      todayTotals: { spent: t?.spent ?? 0, earned: t?.earned ?? 0 },
      recent,
      presets,
      layout: settings.dashboardLayout,
      partnerNote: settings.partnerNote,
    };
  }
}
