import type { QueryClient } from "@tanstack/react-query";
import type { DashboardDTO, EntryDTO } from "./types";

const KEY = ["dashboard"];
const PENDING = "pending-";

export const isPendingEntry = (e: EntryDTO) => e.id.startsWith(PENDING);

export interface OptimisticEntry {
  kind: EntryDTO["kind"];
  total: number;
  partnerShare?: number;
  categoryId?: string | null;
  note?: string | null;
  merchant?: string | null;
  source?: EntryDTO["source"];
}

/**
 * Shows the result of a save on the dashboard before the server answers: today's totals, the partner
 * balance and a "pending" row in recent. Returns a rollback. The real refetch replaces all of it.
 */
export async function applyOptimisticEntry(qc: QueryClient, e: OptimisticEntry): Promise<() => void> {
  await qc.cancelQueries({ queryKey: KEY });
  const prev = qc.getQueryData<DashboardDTO>(KEY);
  if (!prev) return () => undefined;
  const partnerShare = e.partnerShare ?? 0;
  const now = new Date().toISOString();
  const row: EntryDTO = {
    id: `${PENDING}${Date.now()}`, kind: e.kind, occurredAt: now, createdAt: now, total: e.total, partnerShare,
    categoryId: e.categoryId ?? null, note: e.note ?? null, merchant: e.merchant ?? null, source: e.source ?? "manual",
  };
  qc.setQueryData<DashboardDTO>(KEY, {
    ...prev,
    partnerBalance: e.kind === "repayment" ? prev.partnerBalance - e.total : prev.partnerBalance + partnerShare,
    todayTotals: {
      spent: prev.todayTotals.spent + (e.kind === "expense" ? e.total - partnerShare : 0),
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
