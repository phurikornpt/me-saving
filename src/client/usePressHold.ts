"use client";

import { useEffect, useRef, useState } from "react";
import { CHARGE_MS, INTENT_MS, initialPress, press, type PressEvent, type PressPhase } from "./pressHold";

/**
 * Pointer handlers for "tap = log, hold = open the picker" (timing rules in pressHold.ts).
 * After it opens, the finger keeps its pointer capture, so moves and the release reach `onDrag`
 * and `onDrop` with screen coordinates: the picker works out what is under the finger.
 */
export function usePressHold(cb: {
  onTap: () => void;
  onOpen: () => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => void;
  /** The finger just landed (warm up whatever the picker will need). */
  onDown?: () => void;
}) {
  const [phase, setPhase] = useState<PressPhase>("idle");
  const state = useRef(initialPress);
  const origin = useRef({ x: 0, y: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef(cb);
  useEffect(() => {
    latest.current = cb;
  });
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const send = (e: PressEvent, x = 0, y = 0) => {
    const { state: next, outcome } = press(state.current, e);
    state.current = next;
    setPhase(next.phase);
    if (next.phase === "idle" || next.phase === "open") clear();
    if (outcome === "tap") latest.current.onTap();
    else if (outcome === "open") {
      navigator.vibrate?.(10);
      latest.current.onOpen();
    } else if (outcome === "drag") latest.current.onDrag(x, y);
    else if (outcome === "drop") latest.current.onDrop(x, y);
  };

  return {
    phase,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // moves and the release keep coming here once the picker covers the chip
        } catch {
          /* synthetic pointers can't be captured; a plain tap still works */
        }
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        const at = performance.now();
        send({ type: "down", at });
        latest.current.onDown?.();
        timers.current = [
          setTimeout(() => send({ type: "tick", at: at + INTENT_MS }), INTENT_MS),
          setTimeout(() => send({ type: "tick", at: at + INTENT_MS + CHARGE_MS }), INTENT_MS + CHARGE_MS),
        ];
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (state.current.phase === "idle") return;
        send({ type: "move", dx: e.clientX - origin.current.x, dy: e.clientY - origin.current.y }, e.clientX, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => send({ type: "up" }, e.clientX, e.clientY),
      // the browser took the gesture over (the row started scrolling sideways)
      onPointerCancel: () => send({ type: "cancel" }),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}
