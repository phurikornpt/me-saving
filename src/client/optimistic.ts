import type { QueryClient } from "@tanstack/react-query";
import { sumShares } from "@/domain/split";
import type { DashboardDTO, EntryDTO, Share } from "./types";

const KEY = ["dashboard"];
const PENDING = "pending-";

export const isPendingEntry = (e: EntryDTO) => e.id.startsWith(PENDING);

export interface OptimisticEntry {
  kind: EntryDTO["kind"];
  total: number;
  shares?: Share[];
  /** Who paid us back (repayments). */
  personId?: string;
  categoryId?: string | null;
  note?: string | null;
  merchant?: string | null;
  source?: EntryDTO["source"];
}

/**
 * Shows the result of a save on the dashboard before the server answers: today's totals, what each
 * person owes and a "pending" row in recent. Returns a rollback. The real refetch replaces all of it.
 */
export async function applyOptimisticEntry(qc: QueryClient, e: OptimisticEntry): Promise<() => void> {
  await qc.cancelQueries({ queryKey: KEY });
  const prev = qc.getQueryData<DashboardDTO>(KEY);
  if (!prev) return () => undefined;
  const shares = e.shares ?? [];
  const othersShare = sumShares(shares);
  const now = new Date().toISOString();
  const row: EntryDTO = {
    id: `${PENDING}${Date.now()}`, kind: e.kind, occurredAt: now, createdAt: now, total: e.total, shares, othersShare,
    personId: e.personId ?? null, categoryId: e.categoryId ?? null, note: e.note ?? null, merchant: e.merchant ?? null,
    source: e.source ?? "manual",
  };
  const owed = new Map(prev.balances.map((b) => [b.personId, b.balance]));
  for (const s of shares) owed.set(s.personId, (owed.get(s.personId) ?? 0) + s.amount);
  if (e.kind === "repayment" && e.personId) owed.set(e.personId, (owed.get(e.personId) ?? 0) - e.total);
  qc.setQueryData<DashboardDTO>(KEY, {
    ...prev,
    balances: [...owed].filter(([, b]) => b !== 0).map(([personId, balance]) => ({ personId, balance })),
    todayTotals: {
      spent: prev.todayTotals.spent + (e.kind === "expense" ? e.total - othersShare : 0),
      earned: prev.todayTotals.earned + (e.kind === "income" ? e.total : 0),
    },
    recent: [row, ...prev.recent].slice(0, 5),
  });
  return () => qc.setQueryData(KEY, prev);
}

/** No-spend: mark today as logged right away. */
export async function applyOptimisticNoSpend(qc: QueryClient): Promise<() => void> {
  await qc.cancelQueries({ queryKey: KEY });
  const prev = qc.getQueryData<DashboardDTO>(KEY);
  if (!prev) return () => undefined;
  qc.setQueryData<DashboardDTO>(KEY, { ...prev, streak: { ...prev.streak, loggedToday: true, atRisk: false } });
  return () => qc.setQueryData(KEY, prev);
}
