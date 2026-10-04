// Shared motion values, so every screen speaks the same speed. See docs/MOTION_PLAN.md.

/** Durations in seconds: quick feedback, normal transitions, big moves. */
export const DUR = { fast: 0.15, base: 0.25, slow: 0.4 } as const;

/** The spring the mode wheel already uses; reuse it for anything that should feel the same. */
export const SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

/**
 * Delay for the i-th item of a list that flows in one after another. Grows by `step` per item but never
 * past `max`, so a long list doesn't make the user wait for its tail.
 */
export function staggerDelay(i: number, step = 0.04, max = 0.4): number {
  return Math.min(Math.max(0, i) * step, max);
}

/** How long a wait must last before we say it is taking longer than usual. */
export const SLOW_AFTER_MS = 6000;

/**
 * A loading cue that does not flash: it turns on only after `delay` ms of waiting, and once on it stays
 * on for at least `min` ms. A wait that ends before `delay` never shows it. Plain timers, so it can be tested.
 */
export function createDelayedFlag(delay: number, min: number, onChange: (shown: boolean) => void) {
  let shown = false;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    hideTimer = undefined;
    shown = false;
    onChange(false);
  };
  return {
    set(active: boolean) {
      if (active) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
        if (shown || showTimer) return;
        showTimer = setTimeout(() => {
          showTimer = undefined;
          shown = true;
          shownAt = Date.now();
          onChange(true);
        }, delay);
        return;
      }
      clearTimeout(showTimer);
      showTimer = undefined;
      if (!shown || hideTimer) return;
      const left = min - (Date.now() - shownAt);
      if (left <= 0) hide();
      else hideTimer = setTimeout(hide, left);
    },
    dispose() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    },
  };
}
