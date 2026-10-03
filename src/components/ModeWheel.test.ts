import { describe, expect, it } from "vitest";
import { slotAt } from "./ModeWheel";

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
