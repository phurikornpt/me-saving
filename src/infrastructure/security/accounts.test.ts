import { describe, expect, it } from "vitest";
import { parseExtraAccounts } from "./accounts";

describe("parseExtraAccounts", () => {
  it("reads email|hash pairs split by ';' and skips malformed entries", () => {
    expect(parseExtraAccounts("a@x.com|scrypt:1:2:3:s:h; b@x.com|scrypt:4:5:6:s:h ;broken;|nohash;nomail|")).toEqual([
      { email: "a@x.com", passwordHash: "scrypt:1:2:3:s:h" },
      { email: "b@x.com", passwordHash: "scrypt:4:5:6:s:h" },
    ]);
    expect(parseExtraAccounts(undefined)).toEqual([]);
  });
});
