"use client";

import { useEffect, useSyncExternalStore } from "react";
import { clearFirstLogToday, readFirstLog, subscribeFirstLog } from "@/client/justLogged";
import type { DashboardDTO } from "@/client/types";
import { AnimatedNumber } from "../AnimatedNumber";
import { Icon } from "../Icon";
import { WidgetCard } from "./WidgetCard";

const LABELS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function StreakWidget({ data }: { data: DashboardDTO }) {
  const { streak, level } = data;
  const todayIdx = (new Date(`${data.today}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
  // The run ends today (if logged) or yesterday (still alive); light the last `current` days of this week.
  const lastLit = streak.loggedToday ? 6 : 5;
  const lit = (i: number) => i > lastLit - Math.min(streak.current, 7) && i <= lastLit;
  const pct = Math.round((level.xpIntoLevel / level.xpForNext) * 100);
  // First log of the day just happened and the dashboard already shows today lit: play the reward once.
  const flagged = useSyncExternalStore(subscribeFirstLog, readFirstLog, () => false);
  const reward = flagged && streak.loggedToday;
  useEffect(() => {
    if (!reward) return;
    const t = setTimeout(clearFirstLogToday, 1500);
    return () => clearTimeout(t);
  }, [reward]);

  return (
    <WidgetCard title="streak">
      <div className="flex items-center gap-3">
        <Icon name="local_fire_department" size={44} fill className={`${streak.current > 0 ? "text-expense" : "text-ink-3"} ${reward ? "flame-pop" : ""}`} />
        <div>
          <div className="font-bold text-4xl leading-none"><AnimatedNumber value={streak.current} format={(n) => String(n)} /></div>
          <div className="text-xs text-ink-3">วันติด</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-ink-3">Lv {level.level}</div>
          <div className="font-bold text-xl text-xp">{level.xpIntoLevel}<span className="text-sm text-ink-3"> / {level.xpForNext} XP</span></div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-xp transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-ink-3">
        {LABELS.map((l, i) => {
          const isToday = i === 6;
          return (
            <div key={l} className="flex flex-col items-center gap-1">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  lit(i) ? "bg-streak shadow-[0_3px_0_#b6cf3a]" : "bg-surface"
                } ${isToday && !streak.loggedToday ? "ring-2 ring-expense animate-pulse" : ""} ${isToday && reward ? "dot-pop" : ""}`}
              >
                <Icon name="local_fire_department" size={20} fill={lit(i)} className={lit(i) ? "text-black" : "text-ink-3"} />
              </span>
              <span className={isToday ? "text-ink" : ""}>{LABELS[(todayIdx - (6 - i) + 7 * 2) % 7]}</span>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
