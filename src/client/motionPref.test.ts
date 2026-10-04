import { describe, expect, it, vi } from "vitest";
import { buzz, PATTERNS } from "./haptics";
import { resolveReduced } from "./motionPref";

describe("resolveReduced", () => {
  it("reduces when the user asked here or the system asks, and only then", () => {
    expect(resolveReduced("system", false)).toBe(false);
    expect(resolveReduced("system", true)).toBe(true);
    expect(resolveReduced("reduce", false)).toBe(true);
    expect(resolveReduced("reduce", true)).toBe(true);
  });
});

describe("buzz", () => {
  it("sends the pattern for the kind", () => {
    const vibrate = vi.fn(() => true);
    expect(buzz("error", false, { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(PATTERNS.error);
  });
  it("stays silent when motion is reduced, and where there is no vibration (iPhone)", () => {
    const vibrate = vi.fn(() => true);
    expect(buzz("ok", true, { vibrate })).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(buzz("ok", false, {})).toBe(false);
  });
  it("a refusing browser does not throw", () => {
    expect(buzz("streak", false, { vibrate: () => { throw new Error("blocked"); } })).toBe(false);
  });
  it("the three buzzes are distinct and the error one is the longest", () => {
    const total = (p: number[]) => p.reduce((a, b) => a + b, 0);
    expect(new Set(Object.values(PATTERNS).map((p) => p.join(","))).size).toBe(3);
    expect(total(PATTERNS.streak)).toBeGreaterThan(total(PATTERNS.ok));
  });
});
