"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { personColor } from "@/client/people";
import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";

type Preset = DashboardDTO["presets"][number];

/** How long the chip shows a check after a tap, so the log is felt even without looking at the toast. */
const DONE_MS = 900;

/**
 * One preset on the dashboard. A tap logs it straight away; the chip presses in, shows a check and
 * floats "+฿50" up out of itself. `failed` going up shakes it (the error toast says what happened).
 */
export function PresetChip({
  preset,
  people,
  disabled,
  failed,
  onTap,
}: {
  preset: Preset;
  people: DashboardDTO["people"];
  disabled: boolean;
  /** Bumped by the parent each time this preset's save fails. */
  failed: number;
  onTap: () => void;
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const [taps, setTaps] = useState<number[]>([]); // one floating "+฿x" per tap, so quick double taps both show
  const [done, setDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seenFailures = useRef(failed);

  useEffect(() => () => clearTimeout(doneTimer.current), []);
  useEffect(() => {
    if (failed === seenFailures.current) return;
    seenFailures.current = failed;
    clearTimeout(doneTimer.current);
    setDone(false);
    if (!reduce) void animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.35 });
  }, [failed, reduce, animate, scope]);

  const tap = () => {
    onTap();
    navigator.vibrate?.(8);
    setDone(true);
    clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setDone(false), DONE_MS);
    if (!reduce) setTaps((t) => [...t, Date.now()]);
  };

  return (
    <motion.button
      ref={scope}
      disabled={disabled}
      onClick={tap}
      whileTap={reduce ? undefined : { y: 2, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 700, damping: 30 }}
      className="relative flex shrink-0 items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm shadow-[0_3px_0_var(--line)]"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={done ? "done" : "icon"}
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? undefined : { scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex ${done ? "text-income" : ""}`}
          >
            <Icon name={done ? "check" : preset.icon} size={20} />
          </motion.span>
        </AnimatePresence>
      </span>
      {preset.label} <span className="text-ink-3">฿{formatBaht(preset.amount)}</span>
      {preset.personId && (
        <span style={{ color: personColor(people, preset.personId) }}>
          <Icon name="group" size={16} />
        </span>
      )}
      <AnimatePresence>
        {taps.map((id) => (
          <motion.span
            key={id}
            aria-hidden
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -34, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            onAnimationComplete={() => setTaps((t) => t.filter((x) => x !== id))}
            className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-semibold text-expense"
          >
            +฿{formatBaht(preset.amount)}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.button>
  );
}
