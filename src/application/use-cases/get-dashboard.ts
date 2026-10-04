import { addDays, bangkokDay, type DayKey } from "@/domain/day";
import type { LayoutItem } from "@/domain/dashboard-layout";
import type { Satang } from "@/domain/money";
import { balances } from "@/domain/ledger";
import { computeStreak, type StreakState } from "@/domain/streak";
import { levelFromXp, type LevelState } from "@/domain/xp";
import type {
  Clock,
  EntryRecord,
  PersonRecord,
  PresetRecord,
  PresetRepo,
  Repos,
  SettingsRepo,
  StatsRepo,
} from "../ports";
import { walletViews, type WalletView } from "./manage-wallets";

export interface DashboardView {
  today: DayKey;
  streak: StreakState;
  level: LevelState;
  xpTotal: number;
  people: PersonRecord[];
  /** What each person owes us now. Only people with a non-zero balance. */
  balances: { personId: string; balance: Satang }[];
  todayTotals: { spent: Satang; earned: Satang };
  recent: EntryRecord[];
  presets: PresetRecord[];
  layout: LayoutItem[];
  /** Every wallet with its balance; `isDefault` marks where new entries go. */
  wallets: WalletView[];
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
    const [days, xpTotal, ledger, totals, recent, presets, settings, people, wallets] = await Promise.all([
      this.repos.loggedDays.allDays(),
      this.repos.xp.total(),
      this.repos.entries.ledger(),
      this.stats.dailyTotals(today, addDays(today, 1)),
      this.repos.entries.recent(5),
      this.presets.list(),
      this.settings.get(),
      this.repos.people.list(),
      walletViews(this.repos.wallets),
    ]);
    const t = totals.find((x) => x.day === today);
    return {
      today,
      streak: computeStreak(days, today),
      level: levelFromXp(xpTotal),
      xpTotal,
      people,
      balances: [...balances(ledger)].filter(([, b]) => b !== 0).map(([personId, balance]) => ({ personId, balance })),
      todayTotals: { spent: t?.spent ?? 0, earned: t?.earned ?? 0 },
      recent,
      presets,
      layout: settings.dashboardLayout,
      wallets,
    };
  }
}
