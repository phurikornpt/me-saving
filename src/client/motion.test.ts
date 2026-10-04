import { describe, expect, it, vi } from "vitest";
import { clearFirstLogToday, markFirstLogToday, readFirstLog, subscribeFirstLog } from "./justLogged";
import { DUR, staggerDelay } from "./motion";

describe("staggerDelay", () => {
  it("grows by one step per item", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(0.04);
    expect(staggerDelay(5)).toBeCloseTo(0.2);
  });
  it("stops at the cap so a long list does not keep the user waiting", () => {
    expect(staggerDelay(10)).toBeCloseTo(0.4);
    expect(staggerDelay(60)).toBeCloseTo(0.4);
  });
  it("never goes negative, and honours a custom step and cap", () => {
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(4, 0.07, 0.2)).toBeCloseTo(0.2);
  });
  it("durations are ordered fast < base < slow", () => {
    expect(DUR.fast).toBeLessThan(DUR.base);
    expect(DUR.base).toBeLessThan(DUR.slow);
  });
});

describe("first log of the day flag", () => {
  it("is off, turns on once, and tells subscribers only when it actually changes", () => {
    clearFirstLogToday();
    const seen = vi.fn();
    const off = subscribeFirstLog(seen);
    expect(readFirstLog()).toBe(false);
    markFirstLogToday();
    markFirstLogToday(); // already on
    expect(readFirstLog()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    clearFirstLogToday();
    clearFirstLogToday(); // already off
    expect(readFirstLog()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    markFirstLogToday();
    expect(seen).toHaveBeenCalledTimes(2); // unsubscribed
    clearFirstLogToday();
  });
});
