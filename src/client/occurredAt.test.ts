import { describe, expect, it } from "vitest";
import { occurredAtFor, usableScanDay } from "./occurredAt";

const TODAY = "2026-10-04";

describe("occurredAtFor", () => {
  it("sends nothing for no day, today or the future", () => {
    expect([undefined, null, "", TODAY, "2026-10-05"].map((d) => occurredAtFor(d, TODAY))).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
  it("sends a past day as noon in Bangkok", () => {
    expect(occurredAtFor("2026-10-01", TODAY)).toBe("2026-10-01T05:00:00.000Z");
  });
});

describe("usableScanDay", () => {
  it("keeps a read day up to today, drops anything else", () => {
    expect(usableScanDay("2026-10-03", TODAY)).toBe("2026-10-03");
    expect(usableScanDay(TODAY, TODAY)).toBe(TODAY);
    expect(usableScanDay("2569-10-03", TODAY)).toBe("");
    expect(usableScanDay("03/10/2026", TODAY)).toBe("");
    expect(usableScanDay(null, TODAY)).toBe("");
  });
});
