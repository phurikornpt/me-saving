"use client";

import { useSyncExternalStore } from "react";

const KEY = "me-budget-wallet-filter";
const EVENT = "me-budget:wallet-filter";

/** The wallet the dashboard's money views are narrowed to, or null for every wallet. Per device. */
function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setWalletFilter(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
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

export const useWalletFilter = () => useSyncExternalStore(subscribe, read, () => null);

/** Does this entry move money in or out of the wallet? (transfers count on both ends) */
export const inWallet = (e: { walletId: string; toWalletId: string | null }, walletId: string | null) =>
  !walletId || e.walletId === walletId || e.toWalletId === walletId;
