import { describe, expect, it } from "vitest";
import { revealRadius } from "./themeReveal";

describe("revealRadius", () => {
  it("from a corner it is the screen diagonal", () => {
    expect(revealRadius(0, 0, 300, 400)).toBeCloseTo(500);
    expect(revealRadius(300, 400, 300, 400)).toBeCloseTo(500);
  });
  it("from the middle it is half the diagonal", () => {
    expect(revealRadius(150, 200, 300, 400)).toBeCloseTo(250);
  });
  it("always reaches the farthest corner", () => {
    const r = revealRadius(100, 50, 300, 400);
    for (const [cx, cy] of [[0, 0], [300, 0], [0, 400], [300, 400]]) expect(r).toBeGreaterThanOrEqual(Math.hypot(cx - 100, cy - 50) - 1e-9);
  });
});
