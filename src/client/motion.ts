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
