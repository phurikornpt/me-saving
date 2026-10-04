import type { LayoutItem } from "@/domain/dashboard-layout";
import type { LineOwners, Share, SplitMode } from "@/domain/split";
import type { LevelState } from "@/domain/xp";
import type { StreakState } from "@/domain/streak";

export type { LayoutItem, LineOwners, Share, SplitMode, LevelState, StreakState };

// Shapes returned by /api/*. Money is integer satang, timestamps are ISO strings.
export interface EntryDTO {
  id: string;
  kind: "expense" | "income" | "repayment" | "transfer";
  occurredAt: string;
  createdAt: string;
  total: number;
  /** What each person owes us for this entry; `othersShare` is their sum. */
  shares: Share[];
  othersShare: number;
  /** Who paid us back (repayments only). */
  personId: string | null;
  categoryId: string | null;
  note: string | null;
  merchant: string | null;
  source: "manual" | "preset" | "receipt" | "itemized" | "wheel";
  /** Where the money left from (expense, transfer) or arrived in (income, repayment). */
  walletId: string;
  /** Where a transfer's money went. */
  toWalletId: string | null;
}
export interface WalletDTO {
  id: string;
  name: string;
  icon: string;
  openingBalance: number;
  sort: number;
  archived: boolean;
  /** Now. Negative = a card that is owed. */
  balance: number;
  /** Where new entries go unless another wallet is picked. */
  isDefault: boolean;
}
export interface PersonDTO { id: string; name: string; note: string; sort: number; archived: boolean }
export interface CategoryDTO { id: string; name: string; icon: string; kind: "expense" | "income"; sort: number; archived: boolean }
export interface PresetDTO { id: string; label: string; icon: string; amount: number; categoryId: string | null; personId: string | null; splitKind: "equal" | "theirs" | null; walletId: string | null; sort: number }
export interface DashboardDTO {
  today: string;
  streak: StreakState;
  level: LevelState;
  xpTotal: number;
  people: PersonDTO[];
  balances: { personId: string; balance: number }[];
  todayTotals: { spent: number; earned: number };
  recent: EntryDTO[];
  presets: PresetDTO[];
  layout: LayoutItem[];
  /** Missing from dashboards cached before wallets existed. */
  wallets?: WalletDTO[];
}
export interface CalendarDTO {
  month: string;
  days: { day: string; spent: number; earned: number; logged: "entry" | "no_spend" | null }[];
  totals: { spent: number; earned: number; net: number };
  maxSpent: number;
}
export interface CategoryBreakdownDTO {
  month: string;
  total: number;
  slices: { categoryId: string | null; name: string; icon: string; spent: number }[];
}
export type OutstandingDTO = { personId: string; balance: number; items: { entryId: string; occurredAt: string; amount: number; outstanding: number }[] }[];
export interface ActivityDTO { xpGained: number; streak: number; leveledUp: boolean }
export interface DraftLineDTO { rawName: string; canonicalName: string; qty: number; price: number; categoryName: string | null; owners: LineOwners; ownerSource: "memory" | "ai" | "default"; lowConfidence: boolean }
export interface ReceiptDraftDTO { merchant: string | null; date: string | null; total: number; lines: DraftLineDTO[]; sumMismatch: boolean }
export interface SettingsDTO { dashboardLayout: LayoutItem[]; meNote: string }
