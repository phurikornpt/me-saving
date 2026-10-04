"use client";

import { Icon } from "./Icon";

export type PicState = "wait" | "reading" | "ok" | "failed";

/**
 * One tile per picture while several are read: waiting, being read (a light circles it), done, or unreadable
 * (it shakes once). Shows the real outcome of each AI call; the pictures themselves are not shown.
 */
export function ScanStrip({ states }: { states: PicState[] }) {
  return (
    <ul className="mb-4 flex w-full max-w-xs gap-2" aria-label="สถานะแต่ละรูป">
      {states.map((s, i) => (
        <li
          key={i}
          className={`pic-tile relative grid h-14 min-w-0 flex-1 place-items-center rounded-2xl border bg-card text-xs ${
            s === "reading" ? "pic-reading border-primary" : s === "failed" ? "pic-bad border-expense" : "border-line"
          } ${s === "wait" ? "text-ink-3" : "text-ink"}`}
        >
          รูป {i + 1}
          {s === "ok" && (
            <span className="dot-pop absolute -right-1.5 -top-2 grid size-5 place-items-center rounded-full bg-primary text-white" aria-label="อ่านแล้ว">
              <Icon name="check" size={14} />
            </span>
          )}
          {s === "failed" && (
            <span className="absolute -right-1.5 -top-2 grid size-5 place-items-center rounded-full bg-expense text-white" aria-label="อ่านไม่ได้">
              <Icon name="close" size={14} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
