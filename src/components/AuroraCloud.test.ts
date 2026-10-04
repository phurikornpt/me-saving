import { describe, expect, it } from "vitest";
import { CLOUD_LOOK } from "./AuroraCloud";

describe("cloud looks", () => {
  it("only the error look is drained of colour, and it is the dimmest and slowest", () => {
    const others = Object.entries(CLOUD_LOOK).filter(([k]) => k !== "error").map(([, v]) => v);
    expect(CLOUD_LOOK.error.grey).toBe(1);
    expect(others.every((l) => l.grey === 0)).toBe(true);
    expect(others.every((l) => l.energy > CLOUD_LOOK.error.energy)).toBe(true);
    expect(others.every((l) => l.spin > CLOUD_LOOK.error.spin)).toBe(true);
  });
  it("thinking is the cool, fast, tight one; listening is the widest and brightest", () => {
    expect(CLOUD_LOOK.thinking.think).toBe(1);
    expect(CLOUD_LOOK.thinking.spin).toBeGreaterThan(CLOUD_LOOK.listening.spin);
    expect(CLOUD_LOOK.listening.spread).toBeGreaterThan(CLOUD_LOOK.thinking.spread);
    expect(CLOUD_LOOK.listening.energy).toBe(1);
  });
});
