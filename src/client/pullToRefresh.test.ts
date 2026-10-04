import { describe, expect, it } from "vitest";
import { MAX_PULL, PULL_THRESHOLD, pullDistance, shouldRefresh } from "./pullToRefresh";

describe("pull to refresh", () => {
  it("resists the drag by half, never goes negative, and stops at the cap", () => {
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(1000)).toBe(MAX_PULL);
  });
  it("refreshes only once pulled past the threshold", () => {
    expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false);
    expect(shouldRefresh(PULL_THRESHOLD)).toBe(true);
    expect(shouldRefresh(pullDistance(139))).toBe(false);
    expect(shouldRefresh(pullDistance(140))).toBe(true);
  });
});
