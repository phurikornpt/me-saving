import { describe, expect, it } from "vitest";
import { createEnvCredentialVerifier, parseExtraAccounts } from "./env-credential-verifier";
import { hashPassword } from "./password";

const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe("env credential verifier", () => {
  it("accepts the main account and every extra account, nobody else", async () => {
    const main = await hashPassword("main password 12345", FAST);
    const extra = await hashPassword("extra password 12345", FAST);
    const v = createEnvCredentialVerifier("Main@x.com", main, [{ email: "friend@x.com", passwordHash: extra }]);
    expect(await v.verify("main@x.com", "main password 12345")).toBe(true);
    expect(await v.verify(" FRIEND@x.com ", "extra password 12345")).toBe(true);
    expect(await v.verify("main@x.com", "extra password 12345")).toBe(false); // passwords don't cross accounts
    expect(await v.verify("friend@x.com", "main password 12345")).toBe(false);
    expect(await v.verify("other@x.com", "main password 12345")).toBe(false);
  });
});

describe("parseExtraAccounts", () => {
  it("reads email|hash pairs split by ';' and skips malformed entries", () => {
    expect(parseExtraAccounts("a@x.com|scrypt:1:2:3:s:h; b@x.com|scrypt:4:5:6:s:h ;broken;|nohash;nomail|")).toEqual([
      { email: "a@x.com", passwordHash: "scrypt:1:2:3:s:h" },
      { email: "b@x.com", passwordHash: "scrypt:4:5:6:s:h" },
    ]);
    expect(parseExtraAccounts(undefined)).toEqual([]);
  });
});
