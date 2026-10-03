import { bangkokDay } from "@/domain/day";
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
  const xpBefore = await repos.xp.total();
  let xpGained = 0;

  if (!(await repos.loggedDays.has(today))) {
    await repos.loggedDays.add(today, kind, now);
    const streak = computeStreak(await repos.loggedDays.allDays(), today).current;
    xpGained = xpForFirstLogOfDay(streak);
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

  const streak = computeStreak(await repos.loggedDays.allDays(), today).current;
  const leveledUp = levelFromXp(xpBefore + xpGained).level > levelFromXp(xpBefore).level;
  return { xpGained, streak, leveledUp };
}
