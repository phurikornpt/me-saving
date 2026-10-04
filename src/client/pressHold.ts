/**
 * Tap vs hold on a preset chip, as a pure state machine so the timing rules are testable.
 *
 * - Released within INTENT_MS: a tap. Nothing showed while pressing.
 * - Still down after INTENT_MS: "charging" (the chip sinks and fills) for CHARGE_MS, then "open".
 * - The finger travelling MOVE_CANCEL_PX before it opens means the row is being scrolled: cancel.
 * - Released while charging: a tap if the finger stayed put, so a slow tap still logs.
 */
export const INTENT_MS = 120;
export const CHARGE_MS = 280;
export const MOVE_CANCEL_PX = 10;

export type PressPhase = "idle" | "pressing" | "charging" | "open";

export type PressEvent =
  | { type: "down"; at: number }
  | { type: "tick"; at: number }
  | { type: "move"; dx: number; dy: number }
  | { type: "up" }
  | { type: "cancel" };

export interface PressState {
  phase: PressPhase;
  downAt: number;
}

/** What the caller should do after an event: log a tap, open the popup, or forward a drag/release to it. */
export type PressOutcome = "tap" | "open" | "drag" | "drop" | null;

export const initialPress: PressState = { phase: "idle", downAt: 0 };

export function press(state: PressState, e: PressEvent): { state: PressState; outcome: PressOutcome } {
  const idle = { state: initialPress, outcome: null };
  switch (e.type) {
    case "down":
      return { state: { phase: "pressing", downAt: e.at }, outcome: null };
    case "tick": {
      if (state.phase !== "pressing" && state.phase !== "charging") return { state, outcome: null };
      const held = e.at - state.downAt;
      if (held >= INTENT_MS + CHARGE_MS) return { state: { ...state, phase: "open" }, outcome: "open" };
      if (held >= INTENT_MS && state.phase === "pressing") return { state: { ...state, phase: "charging" }, outcome: null };
      return { state, outcome: null };
    }
    case "move":
      if (state.phase === "open") return { state, outcome: "drag" };
      if ((state.phase === "pressing" || state.phase === "charging") && Math.hypot(e.dx, e.dy) > MOVE_CANCEL_PX) return idle;
      return { state, outcome: null };
    case "up":
      if (state.phase === "open") return { state: initialPress, outcome: "drop" };
      if (state.phase === "pressing" || state.phase === "charging") return { state: initialPress, outcome: "tap" };
      return idle;
    case "cancel":
      return idle;
  }
}
