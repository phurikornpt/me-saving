"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * The whole dashboard, or with `wallet` its money views narrowed to one wallet. The unfiltered one keeps
 * the plain ["dashboard"] key: optimistic updates and the persisted cache work on that one.
 */
export const useDashboard = (wallet: string | null = null) =>
  useQuery({
    queryKey: wallet ? ["dashboard", "wallet", wallet] : ["dashboard"],
    queryFn: () => api.dashboard(wallet),
    placeholderData: (prev) => prev,
  });
export const useCalendar = (month: string, wallet: string | null = null) =>
  useQuery({ queryKey: ["calendar", month, wallet], queryFn: () => api.calendar(month, wallet), placeholderData: (prev) => prev });
export const useCategoryBreakdown = (month: string, wallet: string | null = null) =>
  useQuery({
    queryKey: ["breakdown", month, wallet],
    queryFn: () => api.categoryBreakdown(month, wallet),
    placeholderData: (prev) => prev,
  });
/**
 * The AI summary of a month. Only fetched once `enabled` (the person asked for it): a fetch can spend AI quota,
 * so it never retries on its own. The server caches it, so asking again is free.
 */
export const useMonthSummary = (month: string, enabled: boolean) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["summary", month],
    // A fetch may have spent an AI call, whether it worked or not.
    queryFn: () => api.monthSummary(month).finally(() => void qc.invalidateQueries({ queryKey: ["aiBudget"] })),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
};
/** What is left of the shared daily AI allowance. Other screens invalidate ["aiBudget"] after an AI call. */
export const useAiBudget = () => useQuery({ queryKey: ["aiBudget"], queryFn: api.aiBudget, staleTime: 30_000 });
export const useEntriesOn =(day: string | null) =>
  useQuery({ queryKey: ["entries", day], queryFn: () => api.entriesOn(day!), enabled: !!day });
export const useOutstanding = () => useQuery({ queryKey: ["outstanding"], queryFn: api.outstanding });
export const usePeople = () => useQuery({ queryKey: ["people"], queryFn: api.people, staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
export const useWallets = () => useQuery({ queryKey: ["wallets"], queryFn: api.wallets, staleTime: 60_000 });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });
