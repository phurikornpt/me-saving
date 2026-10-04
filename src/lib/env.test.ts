import { describe, expect, it } from "vitest";
import { aiDailyLimit, cleanEnv, DEFAULT_AI_DAILY_LIMIT } from "./env";

describe("cleanEnv", () => {
  it("trims whitespace and newlines", () => {
    expect(cleanEnv("  me@x.com\n")).toBe("me@x.com");
  });
  it("strips wrapping quotes, either kind", () => {
    expect(cleanEnv('"scrypt:1:2:3:a:b"')).toBe("scrypt:1:2:3:a:b");
    expect(cleanEnv("'me@x.com'")).toBe("me@x.com");
    expect(cleanEnv(' "me@x.com" \n')).toBe("me@x.com");
  });
  it("keeps inner quotes and mismatched ones", () => {
    expect(cleanEnv(`a"b`)).toBe(`a"b`);
    expect(cleanEnv(`"abc`)).toBe(`"abc`);
  });
  it("treats empty / whitespace-only / undefined as unset", () => {
    expect(cleanEnv("")).toBeUndefined();
    expect(cleanEnv("  \n")).toBeUndefined();
    expect(cleanEnv('""')).toBeUndefined();
    expect(cleanEnv(undefined)).toBeUndefined();
  });
});

describe("aiDailyLimit", () => {
  it("defaults to the built-in limit when unset, so the budget is on out of the box", () => {
    expect(aiDailyLimit(undefined)).toBe(DEFAULT_AI_DAILY_LIMIT);
    expect(aiDailyLimit("  ")).toBe(DEFAULT_AI_DAILY_LIMIT);
  });
  it("uses the configured number", () => {
    expect(aiDailyLimit("50")).toBe(50);
    expect(aiDailyLimit(' "5"\n')).toBe(5);
  });
  it("0 turns the limit off", () => {
    expect(aiDailyLimit("0")).toBeNull();
  });
  it("falls back to the old receipt-only variable, but the new one wins", () => {
    expect(aiDailyLimit(undefined, "7")).toBe(7);
    expect(aiDailyLimit("9", "7")).toBe(9);
  });
  it("ignores garbage rather than silently disabling the limit", () => {
    expect(aiDailyLimit("abc")).toBe(DEFAULT_AI_DAILY_LIMIT);
    expect(aiDailyLimit("-3")).toBe(DEFAULT_AI_DAILY_LIMIT);
    expect(aiDailyLimit("2.5")).toBe(DEFAULT_AI_DAILY_LIMIT);
  });
});
