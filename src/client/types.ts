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
  /** The preset it was logged from, if any. */
  presetId?: string | null;
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
/** One price a preset was logged at lately: how often, and when last. */
export interface PresetPriceDTO { amount: number; count: number; lastAt: string }
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
export interface MonthSummaryDTO {
  month: string;
  /** A few short Thai lines. */
  text: string;
  /** ISO time the AI wrote it; null for the fixed "no spending" message. */
  generatedAt: string | null;
}
export interface GroupLineDTO { rawName: string; canonicalName: string; qty: number; price: number; owners: LineOwners; categoryId: string | null; lowConfidence: boolean }
/** One entry with its lines (groups) and who already paid part of it back (then it's frozen). */
export interface EntryDetailDTO { entry: EntryDTO; lines: GroupLineDTO[]; repaidBy: string[] }
export interface OwedLineDTO { name: string; qty: number; amount: number; parts: number }
export interface OwedItemDTO {
  entryId: string; occurredAt: string; amount: number; outstanding: number;
  title: string | null; categoryId: string | null; source: string; lines: OwedLineDTO[];
}
export type OutstandingDTO = { personId: string; balance: number; items: OwedItemDTO[] }[];
/** Shared daily AI allowance. `limit`/`remaining` are null when there is no limit. */
export interface AiBudgetDTO { used: number; limit: number | null; remaining: number | null }
export interface ActivityDTO { xpGained: number; streak: number; leveledUp: boolean }
export interface DraftLineDTO { rawName: string; canonicalName: string; qty: number; price: number; categoryName: string | null; owners: LineOwners; ownerSource: "memory" | "ai" | "default"; lowConfidence: boolean }
export interface TransactionDTO { date: string | null; description: string; amount: number; direction: "out" | "in"; categoryName: string | null }
export interface ReceiptDraftDTO { kind: "receipt" | "delivery" | "online_order" | "transfer_slip" | "history"; transactions: TransactionDTO[]; merchant: string | null; date: string | null; total: number; lines: DraftLineDTO[]; sumMismatch: boolean }
/** A sentence turned into an unsaved entry. Amount is satang, null when none was said. `uncertain` fields get highlighted. */
export interface EntryTextDraftDTO {
  kind: "expense" | "income";
  amount: number | null;
  categoryId: string | null;
  note: string | null;
  split: "none" | "equal" | "theirs";
  personIds: string[];
  walletId: string | null;
  uncertain: ("amount" | "category" | "person" | "wallet")[];
}
export interface SettingsDTO { dashboardLayout: LayoutItem[]; meNote: string }
