"use client";

import { useSyncExternalStore } from "react";
import { SPEND_FILTERS, type SpendFilter } from "@/domain/spend-filter";

const KEY = "me-budget-spend-filter";
const EVENT = "me-budget:spend-filter";

/** Which expenses the calendar counts (all / just ours / ones we fronted). Per device. */
function read(): SpendFilter {
  try {
    const v = window.localStorage.getItem(KEY);
    return SPEND_FILTERS.find((s) => s === v) ?? "all";
  } catch {
    return "all";
  }
}

export function setSpendFilter(spend: SpendFilter) {
  try {
    if (spend === "all") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, spend);
  } catch {
    /* private mode: the choice just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export const useSpendFilter = () => useSyncExternalStore(subscribe, read, (): SpendFilter => "all");

/** Does this entry belong under the filter? Income never does when narrowed; fronted = someone else owes a share. */
export const matchesSpend = (e: { kind: string; othersShare: number }, spend: SpendFilter) =>
  spend === "all" || (e.kind === "expense" && (spend === "fronted" ? e.othersShare > 0 : e.othersShare === 0));
