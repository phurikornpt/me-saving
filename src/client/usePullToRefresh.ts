"use client";

import { useEffect, useRef, useState } from "react";
import { pullDistance, PULL_THRESHOLD, shouldRefresh } from "./pullToRefresh";

/** Touches starting in these never begin a pull: open sheets, and anything marked `data-no-pull` (the mode wheel). */
const IGNORED = '[role="dialog"], [data-no-pull]';
const MIN_SHOW_MS = 500;

/**
 * Pull the page down from the very top to run `onRefresh`. Browsers have no pull-to-refresh in an installed
 * PWA (and we turn their overscroll off), so this is the only way to reload by hand. `pull` is how far the
 * indicator is dragged, `refreshing` is true while `onRefresh` runs.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(onRefresh);
  useEffect(() => {
    latest.current = onRefresh;
  });

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let busy = false;
    let dist = 0;

    const reset = () => {
      tracking = false;
      dist = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      tracking = !busy && e.touches.length === 1 && window.scrollY <= 0 && !target?.closest(IGNORED);
      if (tracking) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      // sideways swipe (the wallet chips scroll that way), an upward drag, or the page scrolled: not a pull
      if ((dist === 0 && Math.abs(dx) > Math.abs(dy)) || dy < 0 || window.scrollY > 0) return reset();
      dist = pullDistance(dy);
      setPull(dist);
    };

    const onEnd = async () => {
      if (!tracking) return;
      const go = shouldRefresh(dist);
      tracking = false;
      if (!go) return reset();
      busy = true;
      setRefreshing(true);
      setPull(PULL_THRESHOLD);
      try {
        // hold the indicator for a moment so a fast refetch doesn't just flash
        await Promise.all([latest.current(), new Promise((r) => setTimeout(r, MIN_SHOW_MS))]);
      } finally {
        busy = false;
        dist = 0;
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  return { pull, refreshing };
}
