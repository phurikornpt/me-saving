"use client";

import { useRouter } from "next/navigation";

/** Go back one step; when the page was opened directly (no history to return to), go to `fallback` instead. */
export function useBackOr(fallback = "/") {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.replace(fallback);
  };
}
