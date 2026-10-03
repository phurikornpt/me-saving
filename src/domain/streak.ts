import { addDays, type DayKey } from "./day";

export interface StreakState {
  /** Consecutive logged days. Still alive if only yesterday is logged. */
  current: number;
  loggedToday: boolean;
  /** Streak > 0 but today is not logged yet: it breaks at midnight Bangkok time. */
  atRisk: boolean;
}

/**
 * `loggedDays` are days on which the user *pressed log* (created_at, Bangkok time),
 * not the occurred_at of the entries. Back-dated entries never feed this.
 */
export function computeStreak(loggedDays: Iterable<DayKey>, today: DayKey): StreakState {
  const logged = new Set(loggedDays);
  const loggedToday = logged.has(today);

  let cursor = loggedToday ? today : addDays(today, -1);
  let current = 0;
  while (logged.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, loggedToday, atRisk: current > 0 && !loggedToday };
}
