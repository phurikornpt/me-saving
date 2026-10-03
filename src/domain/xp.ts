export const XP_FIRST_LOG_OF_DAY = 10;
export const XP_EXTRA_ENTRY = 1;
export const XP_EXTRA_ENTRY_DAILY_CAP = 5;
export const XP_PARTNER_CLEARED = 20;

/** Streak multiplier applies to the first-log-of-day XP only. `streak` includes today. */
export function streakMultiplier(streak: number): number {
  if (streak >= 30) return 2;
  if (streak >= 7) return 1.5;
  return 1;
}

export function xpForFirstLogOfDay(streakIncludingToday: number): number {
  return Math.floor(XP_FIRST_LOG_OF_DAY * streakMultiplier(streakIncludingToday));
}

/** XP for an additional entry on a day already logged; `extraXpToday` = extra-entry XP already earned today. */
export function xpForExtraEntry(extraXpToday: number): number {
  return Math.max(0, Math.min(XP_EXTRA_ENTRY, XP_EXTRA_ENTRY_DAILY_CAP - extraXpToday));
}

/** Going from Lv n to n+1 costs 100 * n XP. */
export const xpToNextLevel = (level: number): number => 100 * level;

export interface LevelState {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
}

export function levelFromXp(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpToNextLevel(level) };
}
