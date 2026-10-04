import { describe, expect, it } from "vitest";
import { CHARGE_MS, INTENT_MS, initialPress, press, type PressEvent, type PressState } from "./pressHold";

const run = (events: PressEvent[]) => {
  let s: PressState = initialPress;
  const outcomes: (string | null)[] = [];
  for (const e of events) {
    const r = press(s, e);
    s = r.state;
    outcomes.push(r.outcome);
  }
  return { phase: s.phase, outcomes: outcomes.filter(Boolean) };
};

describe("press or hold", () => {
  it("a quick tap logs and never shows the charge", () => {
    const r = run([{ type: "down", at: 0 }, { type: "tick", at: INTENT_MS - 1 }, { type: "up" }]);
    expect(r.outcomes).toEqual(["tap"]);
  });
  it("charges after the intent delay, opens after the charge", () => {
    let s = press(initialPress, { type: "down", at: 0 }).state;
    s = press(s, { type: "tick", at: INTENT_MS }).state;
    expect(s.phase).toBe("charging");
    const r = press(s, { type: "tick", at: INTENT_MS + CHARGE_MS });
    expect([r.state.phase, r.outcome]).toEqual(["open", "open"]);
  });
  it("a slow tap released mid-charge still logs", () => {
    expect(run([{ type: "down", at: 0 }, { type: "tick", at: INTENT_MS + 50 }, { type: "up" }]).outcomes).toEqual(["tap"]);
  });
  it("moving before it opens is a scroll: nothing happens", () => {
    const r = run([{ type: "down", at: 0 }, { type: "move", dx: 12, dy: 0 }, { type: "tick", at: 1000 }, { type: "up" }]);
    expect(r.outcomes).toEqual([]);
  });
  it("a small wobble doesn't cancel", () => {
    expect(run([{ type: "down", at: 0 }, { type: "move", dx: 4, dy: 3 }, { type: "up" }]).outcomes).toEqual(["tap"]);
  });
  it("once open, moves are drags and the release is a drop", () => {
    const r = run([{ type: "down", at: 0 }, { type: "tick", at: 1000 }, { type: "move", dx: 0, dy: -200 }, { type: "up" }]);
    expect(r.outcomes).toEqual(["open", "drag", "drop"]);
    expect(r.phase).toBe("idle");
  });
  it("a cancelled pointer (the browser took over to scroll) does nothing", () => {
    expect(run([{ type: "down", at: 0 }, { type: "cancel" }, { type: "up" }]).outcomes).toEqual([]);
  });
});
