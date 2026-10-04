import { describe, expect, it } from "vitest";
import { CENTRE_RADIUS, inCentre, outerRadius, slotAt, targetAt } from "./ModeWheel";

// 6 slots, slot 0 at the top, clockwise
describe("slotAt", () => {
  it("up -> 0, then clockwise every 60 degrees", () => {
    expect(slotAt(0, -100, 6)).toBe(0);
    expect(slotAt(87, -50, 6)).toBe(1); // 60 deg
    expect(slotAt(87, 50, 6)).toBe(2); // 120 deg
    expect(slotAt(0, 100, 6)).toBe(3); // down
    expect(slotAt(-87, 50, 6)).toBe(4);
    expect(slotAt(-87, -50, 6)).toBe(5);
  });
  it("slot 0 covers the sector either side of straight up", () => {
    expect(slotAt(-20, -100, 6)).toBe(0);
    expect(slotAt(20, -100, 6)).toBe(0);
  });
  it("centre dead zone and outside the ring both cancel", () => {
    expect(slotAt(0, -10, 6)).toBeNull();
    expect(slotAt(0, -400, 6)).toBeNull();
    expect(slotAt(0, 330, 6)).toBeNull(); // where a thumb on the [+] button starts
  });
});

describe("targetAt (outer slots)", () => {
  const onlyTop = (i: number) => i === 0;
  it("up a little = the slot, up further = its outer choice", () => {
    expect(targetAt(0, -110, 6, onlyTop)).toEqual({ index: 0, outer: false });
    expect(targetAt(0, -215, 6, onlyTop)).toEqual({ index: 0, outer: true });
    expect(targetAt(0, -400, 6, onlyTop)).toBeNull();
  });
  it("slots without an outer choice still cancel past the ring", () => {
    expect(targetAt(0, 110, 6, onlyTop)).toEqual({ index: 3, outer: false });
    expect(targetAt(0, 215, 6, onlyTop)).toBeNull();
  });
  it("short screens pull the outer ring in, never onto the inner one", () => {
    expect(outerRadius(900)).toBe(215);
    expect(outerRadius(360)).toBe(172);
  });
});

describe("centre slot", () => {
  it("is the middle of the wheel, out to its own radius", () => {
    expect(inCentre(0, 0)).toBe(true);
    expect(inCentre(0, -(CENTRE_RADIUS - 1))).toBe(true);
    expect(inCentre(0, -(CENTRE_RADIUS + 1))).toBe(false);
  });
  it("leaves the ring slots where they were: 6 around, first one still at the top", () => {
    expect(slotAt(0, -112, 6)).toBe(0);
    expect(slotAt(0, 112, 6)).toBe(3);
    expect(CENTRE_RADIUS).toBeLessThan(112 - 40); // does not touch the slots around it
  });
});
