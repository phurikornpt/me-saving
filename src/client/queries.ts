"use client";

import { useQuery } from "@tanstack/react-query";
import type { SpendFilter } from "@/domain/spend-filter";
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
export const useCalendar = (month: string, wallet: string | null = null, spend: SpendFilter = "all") =>
  useQuery({ queryKey: ["calendar", month, wallet, spend], queryFn: () => api.calendar(month, wallet, spend), placeholderData: (prev) => prev });
export const useCategoryBreakdown = (month: string, wallet: string | null = null) =>
  useQuery({
    queryKey: ["breakdown", month, wallet],
    queryFn: () => api.categoryBreakdown(month, wallet),
    placeholderData: (prev) => prev,
  });
export const useEntriesOn = (day: string | null) =>
  useQuery({ queryKey: ["entries", day], queryFn: () => api.entriesOn(day!), enabled: !!day });
export const useOutstanding = () => useQuery({ queryKey: ["outstanding"], queryFn: api.outstanding });
export const usePeople = () => useQuery({ queryKey: ["people"], queryFn: api.people, staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
export const useWallets = () => useQuery({ queryKey: ["wallets"], queryFn: api.wallets, staleTime: 60_000 });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });
