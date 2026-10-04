"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import type { IconName } from "@/client/icons";
import { Icon } from "./Icon";

export interface WheelSlot {
  id: string;
  icon: IconName;
  label: string;
  tone: string; // css color for the icon
  disabled?: boolean;
  /** Small second line under the label (used by the centre slot). */
  sub?: string;
  /** A second choice further out in the same direction (drag past the slot to reach it). */
  outer?: Omit<WheelSlot, "outer">;
}

const HOLD_MS = 250;
const INNER = 36; // dead zone around the centre (release there = cancel)
const OUTER = 175; // beyond this you're "outside the wheel" (release there = cancel)
const RADIUS = 112;
const OUTER_RADIUS = 215; // where an outer slot sits, shrunk on short screens (see outerRadius)
const OUTER_REACH = 60; // how far past an outer slot a release still counts
export const CENTRE_RADIUS = 58; // the big centre slot (when there is one): the finger lands on it first when dragging straight up

/** Whether an offset from the wheel centre is on the big centre slot. */
export const inCentre = (dx: number, dy: number, radius = CENTRE_RADIUS) => Math.hypot(dx, dy) < radius;

/** Short (landscape) screens pull the outer ring in so it stays on screen. */
export const outerRadius = (viewportHeight: number) => Math.max(RADIUS + 60, Math.min(OUTER_RADIUS, viewportHeight / 2 - 50));

/** The slot an offset points at, as a slot index plus whether it reached that slot's outer choice. */
export function targetAt(
  dx: number, dy: number, count: number, hasOuter: (i: number) => boolean, ringRadius = OUTER_RADIUS,
): { index: number; outer: boolean } | null {
  const dist = Math.hypot(dx, dy);
  const split = (RADIUS + ringRadius) / 2; // halfway between the two rings
  if (dist >= split) {
    const i = slotAt(dx, dy, count, Infinity);
    if (i !== null && hasOuter(i)) return dist <= ringRadius + OUTER_REACH ? { index: i, outer: true } : null;
  }
  const i = slotAt(dx, dy, count);
  return i === null ? null : { index: i, outer: false };
}

/** Which slot an offset from the wheel centre points at (slot 0 at the top, clockwise), or null. */
export function slotAt(dx: number, dy: number, count: number, maxDist = OUTER): number | null {
  const dist = Math.hypot(dx, dy);
  if (dist < INNER || dist > maxDist) return null;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise
  const step = 360 / count;
  return Math.floor((((angle + step / 2) % 360) + 360) % 360 / step);
}

/**
 * GTA-style radial picker on the [+] button. Tap = onTap. Hold ~250 ms = the wheel opens in the
 * middle of the screen; drag the finger onto a slot and release to choose it.
 * Releasing without entering the ring cancels. With a `middle` slot the middle of the wheel is a big
 * choice of its own instead of the cancel zone: releasing there after dragging picks it.
 */
export function ModeWheel({
  slots,
  middle,
  onTap,
  onPick,
  onPress,
}: {
  slots: WheelSlot[];
  /** A big choice in the middle of the wheel (instead of the cancel zone). */
  middle?: WheelSlot;
  onTap: () => void;
  onPick: (id: string) => void;
  /** Fires the instant a finger lands (used to warm the backend before the user finishes typing). */
  onPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null); // id of the slot (or outer slot) under the finger
  const [ring, setRing] = useState(OUTER_RADIUS);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const opened = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const compute = (clientX: number, clientY: number) => {
    const c = centre();
    const moved = Math.hypot(clientX - origin.current.x, clientY - origin.current.y) > 12;
    if (!moved) return null; // the finger starts far from the ring; don't preselect anything
    if (middle && inCentre(clientX - c.x, clientY - c.y)) return middle.disabled ? null : middle.id;
    const t = targetAt(clientX - c.x, clientY - c.y, slots.length, (i) => !!slots[i].outer, ring);
    if (!t) return null;
    const s = t.outer ? slots[t.index].outer! : slots[t.index];
    return s.disabled ? null : s.id;
  };

  const close = () => {
    clearTimeout(timer.current);
    opened.current = false;
    setOpen(false);
    setActive(null);
  };

  return (
    <>
      <button
        aria-label="เพิ่มรายการ (กดค้างเพื่อเลือกโหมด)"
        className="intro-pop btn3d fixed bottom-[max(1.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 h-16 w-16 -translate-x-1/2 !p-0"
        style={{ touchAction: "none" }}
        data-no-pull
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // keeps move/up events coming while the finger leaves the button
          } catch {
            /* synthetic or already-released pointers can't be captured; the wheel still works */
          }
          origin.current = { x: e.clientX, y: e.clientY };
          opened.current = false;
          onPress?.();
          timer.current = setTimeout(() => {
            opened.current = true;
            setRing(outerRadius(window.innerHeight));
            setOpen(true);
            navigator.vibrate?.(10);
          }, HOLD_MS);
        }}
        onPointerMove={(e) => {
          if (!opened.current) return;
          const next = compute(e.clientX, e.clientY);
          setActive((cur) => {
            if (next !== cur && next !== null) navigator.vibrate?.(6);
            return next;
          });
        }}
        onPointerUp={(e) => {
          clearTimeout(timer.current);
          if (!opened.current) return onTap();
          const picked = compute(e.clientX, e.clientY);
          close();
          if (picked !== null) onPick(picked);
        }}
        onPointerCancel={close}
      >
        <Icon name="add" size={36} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div className="absolute left-1/2 top-1/2">
              {slots.map((s, i) => {
                const a = ((i * 360) / slots.length) * (Math.PI / 180);
                const on = active === s.id;
                const o = s.outer;
                return [
                  o && (
                    <motion.div
                      key={o.id}
                      initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                      animate={{ x: Math.sin(a) * ring, y: -Math.cos(a) * ring, scale: active === o.id ? 1.2 : 0.9, opacity: o.disabled ? 0.3 : 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 26, delay: 0.04 }}
                      className={`absolute -ml-9 -mt-9 flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-full border-2 border-dashed text-center shadow-lg ${
                        active === o.id ? "border-transparent bg-ink text-[var(--on-ink)]" : "border-line bg-card text-ink"
                      }`}
                    >
                      <Icon name={o.icon} size={24} className={active === o.id ? "" : o.tone} />
                      <span className="mt-0.5 px-1 text-[10px] leading-tight">{o.label}</span>
                    </motion.div>
                  ),
                  <motion.div
                    key={s.id}
                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                    animate={{ x: Math.sin(a) * RADIUS, y: -Math.cos(a) * RADIUS, scale: on ? 1.25 : 1, opacity: s.disabled ? 0.3 : 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    className={`absolute -ml-10 -mt-10 flex h-20 w-20 flex-col items-center justify-center rounded-full text-center shadow-lg ${
                      on ? "bg-ink text-[var(--on-ink)]" : "bg-card text-ink"
                    }`}
                  >
                    <Icon name={s.icon} size={28} className={on ? "" : s.tone} />
                    <span className="mt-0.5 px-1 text-[10px] leading-tight">{s.label}</span>
                  </motion.div>,
                ];
              })}
              {middle ? (
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: active === middle.id ? 1.12 : 1, opacity: middle.disabled ? 0.3 : 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                  className={`wheel-hero absolute flex flex-col items-center justify-center rounded-full text-center ${
                    active === middle.id ? "wheel-hero-on bg-ink text-[var(--on-ink)]" : "bg-primary text-white"
                  }`}
                  style={{ width: CENTRE_RADIUS * 2, height: CENTRE_RADIUS * 2, marginLeft: -CENTRE_RADIUS, marginTop: -CENTRE_RADIUS }}
                >
                  <Icon name={middle.icon} size={46} fill />
                  <span className="mt-0.5 text-[13px] font-medium leading-tight">{middle.label}</span>
                  {middle.sub && <span className="text-[10px] leading-tight opacity-85">{middle.sub}</span>}
                </motion.div>
              ) : (
                <div className="absolute -ml-3 -mt-3 h-6 w-6 rounded-full border-2 border-white/50" />
              )}
              <p className="absolute -ml-32 mt-[178px] w-64 text-center text-sm text-white/80">ลากไปที่ช่อง แล้วปล่อยนิ้ว</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
