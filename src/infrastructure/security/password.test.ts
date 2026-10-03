import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

// Small params keep the test fast; production defaults are exercised once below.
const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe("password hashing (scrypt)", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery staple", FAST);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl3", h)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await hashPassword("same", FAST)).not.toBe(await hashPassword("same", FAST));
  });
  it("has no '$' so .env expansion cannot corrupt it", async () => {
    expect(await hashPassword("x", FAST)).not.toContain("$");
  });
  it("rejects malformed or tampered hashes without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:1:2:3:a:b")).toBe(false);
    expect(await verifyPassword("x", "scrypt:0:8:1:YQ:YQ")).toBe(false);
    expect(await verifyPassword("x", "scrypt:1024:8:1:YQ:YQ")).toBe(false);
  });
  it("is stable across unicode normalisation", async () => {
    const h = await hashPassword("café", FAST);
    expect(await verifyPassword("café", h)).toBe(true);
  });
  it("works with the production defaults", async () => {
    const h = await hashPassword("pw");
    expect(h.startsWith("scrypt:32768:8:3:")).toBe(true);
    expect(await verifyPassword("pw", h)).toBe(true);
  }, 20_000);
});
