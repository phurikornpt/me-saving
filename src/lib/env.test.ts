import { describe, expect, it } from "vitest";
import { cleanEnv } from "./env";

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
