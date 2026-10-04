import { describe, expect, it } from "vitest";
import { isBackdated, isFuture, occurredAtOf, pickableDays, priceChoices, quickWhen, sameWhen, whenLabel, whenOfDay, whenOfInstant } from "./presetChoices";

const NOW = new Date("2026-10-04T05:34:00Z"); // 12:34 Bangkok
const at = (amount: number, count: number, lastAt: string) => ({ amount, count, lastAt });

describe("price tiles", () => {
  it("most used first, marks the latest and the preset's own price", () => {
    const out = priceChoices(5000, [at(6000, 5, "2026-10-03T05:00:00Z"), at(5000, 4, "2026-10-01T05:00:00Z"), at(5500, 2, "2026-09-30T05:00:00Z")]);
    expect(out).toEqual([
      { amount: 6000, count: 5, note: "ล่าสุด · 5×" },
      { amount: 5000, count: 4, note: "เริ่มต้น · 4×" },
      { amount: 5500, count: 2, note: "2×" },
    ]);
  });
  it("a preset never logged still offers its own price", () => {
    expect(priceChoices(4700, [])).toEqual([{ amount: 4700, count: 0, note: "เริ่มต้น" }]);
  });
  it("keeps the preset's own price even when four others were used more", () => {
    const h = [6000, 6500, 7000, 7500].map((a, i) => at(a, 9 - i, "2026-10-01T05:00:00Z"));
    expect(priceChoices(5000, h).map((c) => c.amount)).toEqual([6000, 6500, 7000, 5000]);
  });
});

describe("when it was paid", () => {
  it("now sends nothing; a picked time is that Bangkok wall clock", () => {
    expect(occurredAtOf({ kind: "now" })).toBeUndefined();
    expect(occurredAtOf({ kind: "at", day: "2026-10-03", hour: 19, minute: 30 })).toBe("2026-10-03T12:30:00.000Z");
  });
  it("quick chips", () => {
    expect(quickWhen("hourAgo", NOW)).toEqual({ kind: "at", day: "2026-10-04", hour: 11, minute: 30 });
    expect(quickWhen("yesterday", NOW)).toEqual({ kind: "at", day: "2026-10-03", hour: 12, minute: 30 });
  });
  it("an hour ago just after midnight is yesterday", () => {
    expect(quickWhen("hourAgo", new Date("2026-10-03T17:20:00Z"))).toEqual({ kind: "at", day: "2026-10-03", hour: 23, minute: 20 });
  });
  it("future and backdated", () => {
    expect(isFuture({ kind: "at", day: "2026-10-04", hour: 13, minute: 0 }, NOW)).toBe(true);
    expect(isFuture({ kind: "at", day: "2026-10-04", hour: 12, minute: 30 }, NOW)).toBe(false);
    expect(isBackdated({ kind: "at", day: "2026-10-04", hour: 9, minute: 0 }, NOW)).toBe(false);
    expect(isBackdated({ kind: "at", day: "2026-10-03", hour: 9, minute: 0 }, NOW)).toBe(true);
  });
  it("labels and the day list", () => {
    expect(whenLabel({ kind: "at", day: "2026-10-03", hour: 19, minute: 5 }, NOW)).toBe("เมื่อวาน 19:05");
    expect(whenLabel({ kind: "at", day: "2026-10-01", hour: 8, minute: 0 }, NOW)).toBe("พฤ. 1 ต.ค. 08:00");
    const days = pickableDays(NOW);
    expect([days[0], days.length, days.at(-1)]).toEqual(["2026-10-04", 15, "2026-09-20"]);
  });
});

describe("when helpers", () => {
  it("reaches back to an older day when one is already set", () => {
    const days = pickableDays(NOW, "2026-08-30");
    expect([days[0], days.at(-1)]).toEqual(["2026-10-04", "2026-08-30"]);
    expect(pickableDays(NOW, "2026-10-01")).toHaveLength(15);
  });

  it("reads an instant back as Bangkok wall clock, minute kept exact", () => {
    expect(whenOfInstant(new Date("2026-10-03T10:37:00Z"))).toEqual({ kind: "at", day: "2026-10-03", hour: 17, minute: 37 });
    expect(whenOfInstant(new Date("2026-10-03T18:30:00Z"))).toMatchObject({ day: "2026-10-04", hour: 1 });
  });

  it("a past day is noon, today or nothing is now", () => {
    expect(whenOfDay("2026-10-01", "2026-10-04")).toEqual({ kind: "at", day: "2026-10-01", hour: 12, minute: 0 });
    expect(whenOfDay("2026-10-04", "2026-10-04")).toEqual({ kind: "now" });
    expect(whenOfDay(null, "2026-10-04")).toEqual({ kind: "now" });
  });

  it("compares choices", () => {
    expect(sameWhen({ kind: "now" }, { kind: "now" })).toBe(true);
    expect(sameWhen({ kind: "now" }, whenOfInstant(NOW))).toBe(false);
    expect(sameWhen(whenOfInstant(NOW), whenOfInstant(NOW))).toBe(true);
  });
});
