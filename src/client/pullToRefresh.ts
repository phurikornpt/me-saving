/** How far the indicator is pulled for a finger drag of `dy` px: half the drag, capped, never negative. */
export const MAX_PULL = 120;
export const PULL_THRESHOLD = 70;

export const pullDistance = (dy: number) => Math.min(MAX_PULL, Math.max(0, dy * 0.5));
export const shouldRefresh = (pull: number) => pull >= PULL_THRESHOLD;
