"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
export const useCalendar = (month: string) =>
  useQuery({ queryKey: ["calendar", month], queryFn: () => api.calendar(month), placeholderData: (prev) => prev });
export const useCategoryBreakdown = (month: string) =>
  useQuery({ queryKey: ["breakdown", month], queryFn: () => api.categoryBreakdown(month), placeholderData: (prev) => prev });
export const useEntriesOn = (day: string | null) =>
  useQuery({ queryKey: ["entries", day], queryFn: () => api.entriesOn(day!), enabled: !!day });
export const useOutstanding = () => useQuery({ queryKey: ["outstanding"], queryFn: api.outstanding });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });
