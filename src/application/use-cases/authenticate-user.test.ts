import { describe, expect, it } from "vitest";
import { FixedClock } from "../testing/fakes";
import type { CredentialVerifier, LoginAttemptRepo } from "../ports";
import { ATTEMPT_WINDOW_MS, AuthenticateUser } from "./authenticate-user";

function setup() {
  const log: { key: string; at: Date }[] = [];
  const attempts: LoginAttemptRepo = {
    async countSince(key, since) {
      return log.filter((l) => l.key === key && l.at >= since).length;
    },
    async record(key, at) {
      log.push({ key, at });
    },
    async clear(key) {
      for (let i = log.length - 1; i >= 0; i--) if (log[i].key === key) log.splice(i, 1);
    },
  };
  const verifier: CredentialVerifier = {
    async verify(email, password) {
      return email === "me@example.com" && password === "right-password" ? "user-1" : null;
    },
  };
  const clock = new FixedClock(new Date("2026-10-03T05:00:00Z"));
  return { log, clock, auth: new AuthenticateUser(attempts, verifier, clock) };
}

const ok = { email: "me@example.com", password: "right-password", ip: "1.1.1.1" };
const bad = { ...ok, password: "nope" };

describe("AuthenticateUser", () => {
  it("accepts the right credentials", async () => {
    expect(await setup().auth.execute(ok)).toBe("user-1");
  });
  it("rejects wrong credentials without revealing which part", async () => {
    const { auth } = setup();
    expect(await auth.execute(bad)).toBeNull();
    expect(await auth.execute({ ...ok, email: "other@example.com" })).toBeNull();
  });
  it("locks out after 5 failures, even for the right password", async () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) await auth.execute(bad);
    await expect(auth.execute(ok)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("throttles one IP across different emails", async () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) await auth.execute({ ...bad, email: `x${i}@example.com` });
    await expect(auth.execute(ok)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("lock expires after the window", async () => {
    const { auth, clock } = setup();
    for (let i = 0; i < 5; i++) await auth.execute(bad);
    clock.current = new Date(clock.current.getTime() + ATTEMPT_WINDOW_MS + 1000);
    expect(await auth.execute(ok)).toBe("user-1");
  });
  it("a successful login resets the failure count", async () => {
    const { auth } = setup();
    for (let i = 0; i < 4; i++) await auth.execute(bad);
    expect(await auth.execute(ok)).toBe("user-1");
    for (let i = 0; i < 4; i++) await auth.execute(bad);
    expect(await auth.execute(ok)).toBe("user-1");
  });
  it("email matching is case-insensitive for throttling", async () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) await auth.execute({ ...bad, email: "ME@Example.com", ip: `9.9.9.${i}` });
    await expect(auth.execute({ ...ok, ip: "8.8.8.8" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
