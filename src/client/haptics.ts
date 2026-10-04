import { motionReduced } from "./motionPref";

// Three buzzes, no more, so each still means something. Android only: iPhone has no vibration API,
// where this quietly does nothing.

export type Buzz = "ok" | "streak" | "error";

/** Vibrate/pause lengths in milliseconds. */
export const PATTERNS: Record<Buzz, number[]> = {
  ok: [12],
  streak: [10, 40, 10, 40, 22],
  error: [30, 60, 30],
};

interface Vibrator {
  vibrate?: (pattern: number[]) => boolean;
}

/** `reduced` and `nav` can be passed in for tests; by default they come from the device. */
export function buzz(kind: Buzz, reduced?: boolean, nav?: Vibrator): boolean {
  const skip = reduced ?? (typeof window === "undefined" ? true : motionReduced());
  const n = nav ?? (typeof navigator === "undefined" ? undefined : (navigator as Vibrator));
  if (skip || !n?.vibrate) return false;
  try {
    return n.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
