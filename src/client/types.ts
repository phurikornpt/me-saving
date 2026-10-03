import type { LayoutItem } from "@/domain/dashboard-layout";
import type { Owner, SplitMode } from "@/domain/split";
import type { LevelState } from "@/domain/xp";
import type { StreakState } from "@/domain/streak";

export type { LayoutItem, Owner, SplitMode, LevelState, StreakState };

// Shapes returned by /api/*. Money is integer satang, timestamps are ISO strings.
export interface EntryDTO {
  id: string;
  kind: "expense" | "income" | "repayment";
  occurredAt: string;
  createdAt: string;
  total: number;
  partnerShare: number;
  categoryId: string | null;
  note: string | null;
  merchant: string | null;
  source: "manual" | "preset" | "receipt" | "wheel";
}
export interface CategoryDTO { id: string; name: string; icon: string; kind: "expense" | "income"; sort: number; archived: boolean }
export interface PresetDTO { id: string; label: string; icon: string; amount: number; categoryId: string | null; partnerMode: "split" | "partnerAll" | null; sort: number }
export interface DashboardDTO {
  today: string;
  streak: StreakState;
  level: LevelState;
  xpTotal: number;
  partnerBalance: number;
  todayTotals: { spent: number; earned: number };
  recent: EntryDTO[];
  presets: PresetDTO[];
  layout: LayoutItem[];
  partnerNote: string;
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
export interface OutstandingDTO { balance: number; items: { id: string; occurredAt: string; partnerShare: number; outstanding: number }[] }
export interface ActivityDTO { xpGained: number; streak: number; leveledUp: boolean }
export interface DraftLineDTO { rawName: string; canonicalName: string; qty: number; price: number; categoryName: string | null; owner: Owner; ownerSource: "memory" | "ai" | "default"; lowConfidence: boolean }
export interface ReceiptDraftDTO { merchant: string | null; date: string | null; total: number; lines: DraftLineDTO[]; sumMismatch: boolean }
export interface SettingsDTO { partnerNote: string; dashboardLayout: LayoutItem[] }
