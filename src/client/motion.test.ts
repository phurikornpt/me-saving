import { afterEach, describe, expect, it, vi } from "vitest";
import { _createFlag, clearFirstLogToday, markFirstLogToday, readFirstLog, subscribeFirstLog } from "./justLogged";
import { createDelayedFlag, DUR, staggerDelay } from "./motion";

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

describe("self-clearing flags", () => {
  afterEach(() => vi.useRealTimers());

  it("turns itself off after the delay, and marking again restarts the wait", () => {
    vi.useFakeTimers();
    const f = _createFlag(1000);
    const seen = vi.fn();
    f.subscribe(seen);
    f.mark();
    expect(f.read()).toBe(true);
    vi.advanceTimersByTime(800);
    f.mark(); // a second log: the glow lasts a full second again
    vi.advanceTimersByTime(800);
    expect(f.read()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(f.read()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2); // on, then off; the repeat mark was not a change
  });

  it("clearing early cancels the timer", () => {
    vi.useFakeTimers();
    const f = _createFlag(1000);
    f.mark();
    f.clear();
    f.mark();
    vi.advanceTimersByTime(900);
    expect(f.read()).toBe(true);
  });
});

describe("createDelayedFlag", () => {
  afterEach(() => vi.useRealTimers());
  const setup = () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    return { seen, flag: createDelayedFlag(150, 400, (v) => seen.push(v)) };
  };

  it("never shows for a wait shorter than the delay", () => {
    const { seen, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(100);
    flag.set(false);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });
  it("shows after the delay and stays for the minimum even if the wait ends at once", () => {
    const { seen, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(150);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(50);
    flag.set(false);
    vi.advanceTimersByTime(349);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true, false]);
  });
  it("hides at once when it has already been shown long enough", () => {
    const { seen, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(1000);
    flag.set(false);
    expect(seen).toEqual([true, false]);
  });
  it("a new wait while it is waiting to hide keeps it on", () => {
    const { seen, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(150);
    flag.set(false);
    flag.set(true);
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual([true]);
  });
  it("dispose cancels pending changes", () => {
    const { seen, flag } = setup();
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });
});
