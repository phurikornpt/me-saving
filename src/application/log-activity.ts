import { bangkokDay, type DayKey } from "@/domain/day";
import { computeStreak } from "@/domain/streak";
import { levelFromXp, xpForExtraEntry, xpForFirstLogOfDay } from "@/domain/xp";
import type { Repos } from "./ports";

export interface ActivityResult {
  xpGained: number;
  streak: number;
  leveledUp: boolean;
}

/**
 * Called when the user *presses log* (entry, repayment or no-spend). Streak and
 * XP depend on this press time (Bangkok day), never on an entry's occurred_at.
 */
export async function logActivity(
  repos: Repos,
  now: Date,
  kind: "entry" | "no_spend",
  extraXp = 0,
): Promise<ActivityResult> {
  const today = bangkokDay(now);
  const [xpBefore, alreadyLogged] = await Promise.all([repos.xp.total(), repos.loggedDays.has(today)]);
  let xpGained = 0;
  let days: DayKey[] | undefined;

  if (!alreadyLogged) {
    // Read the history once and add today in memory instead of reading it back after the insert
    const [before] = await Promise.all([repos.loggedDays.allDays(), repos.loggedDays.add(today, kind, now)]);
    days = [...before, today];
    xpGained = xpForFirstLogOfDay(computeStreak(days, today).current);
    await repos.xp.add("first_log", xpGained, now);
  } else if (kind === "entry") {
    const extra = xpForExtraEntry(await repos.xp.extraEntryXpOnDay(today));
    if (extra > 0) {
      xpGained = extra;
      await repos.xp.add("extra_entry", extra, now);
    }
  }

  if (extraXp > 0) {
    xpGained += extraXp;
    await repos.xp.add("partner_cleared", extraXp, now);
  }

  const streak = computeStreak(days ?? (await repos.loggedDays.allDays()), today).current;
  const leveledUp = levelFromXp(xpBefore + xpGained).level > levelFromXp(xpBefore).level;
  return { xpGained, streak, leveledUp };
}
