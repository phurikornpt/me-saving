import { describe, expect, it } from "vitest";
import { allocateToBillTotal } from "./allocate";
import { addDays, bangkokDay } from "./day";
import { DomainError } from "./errors";
import { formatBaht, formatCompact, parseBaht } from "./money";
import {
  assertRepaymentAllowed,
  outstandingByEntry,
  partnerBalance,
  type PartnerExpense,
} from "./partner";
import { partnerShareFor, partnerShareOfLines } from "./split";
import { computeStreak } from "./streak";
import { levelFromXp, xpForExtraEntry, xpForFirstLogOfDay } from "./xp";

describe("money", () => {
  it("parses baht strings without float error", () => {
    expect(parseBaht("84.5")).toBe(8450);
    expect(parseBaht("1,200")).toBe(120000);
    expect(parseBaht("0.07")).toBe(7);
    expect(parseBaht("19.99")).toBe(1999);
  });
  it("rejects junk", () => {
    expect(() => parseBaht("abc")).toThrow(DomainError);
    expect(() => parseBaht("1.234")).toThrow(DomainError);
    expect(() => parseBaht("-5")).toThrow(DomainError);
  });
  it("formats", () => {
    expect(formatBaht(8450)).toBe("84.50");
    expect(formatBaht(8400)).toBe("84");
    expect(formatBaht(120000)).toBe("1,200");
  });
  it("formats compact calendar amounts", () => {
    expect(formatCompact(32000)).toBe("320");
    expect(formatCompact(120000)).toBe("1.2k");
    expect(formatCompact(1500000)).toBe("15k");
  });
});

describe("fronting for partner (FR-3)", () => {
  it("rice 100 split -> partner owes 50", () => {
    expect(partnerShareFor(10000, { kind: "split" })).toBe(5000);
  });
  it("odd satang stays with us", () => {
    expect(partnerShareFor(10001, { kind: "split" })).toBe(5000);
  });
  it("partner all / none / custom", () => {
    expect(partnerShareFor(10000, { kind: "partnerAll" })).toBe(10000);
    expect(partnerShareFor(10000, { kind: "none" })).toBe(0);
    expect(partnerShareFor(10000, { kind: "custom", partnerShare: 3000 })).toBe(3000);
  });
  it("custom share cannot exceed total", () => {
    expect(() => partnerShareFor(10000, { kind: "custom", partnerShare: 10001 })).toThrow(
      DomainError,
    );
  });
  it("rolls receipt lines up by owner", () => {
    expect(
      partnerShareOfLines([
        { price: 3500, owner: "me" },
        { price: 1500, owner: "partner" },
        { price: 8900, owner: "split" },
        { price: 2500, owner: "partner" },
      ]),
    ).toBe(1500 + 4450 + 2500);
  });
});

describe("partner balance + FIFO", () => {
  const e = (id: string, day: number, share: number): PartnerExpense => ({
    id,
    occurredAt: new Date(Date.UTC(2026, 9, day)),
    partnerShare: share,
  });
  const expenses = [e("c", 3, 20000), e("a", 1, 5000), e("b", 2, 8450)];

  it("sums fronted shares minus repayments", () => {
    expect(partnerBalance(expenses, [])).toBe(33450);
    expect(partnerBalance(expenses, [{ total: 10000 }])).toBe(23450);
  });
  it("repayment of 30 against 50 leaves 20", () => {
    expect(partnerBalance([e("x", 1, 5000)], [{ total: 3000 }])).toBe(2000);
  });
  it("applies repayments to the oldest first", () => {
    const out = outstandingByEntry(expenses, [{ total: 10000 }]);
    expect(out.map((o) => [o.id, o.outstanding])).toEqual([
      ["b", 3450],
      ["c", 20000],
    ]);
  });
  it("fully repaid -> nothing outstanding", () => {
    expect(outstandingByEntry(expenses, [{ total: 33450 }])).toEqual([]);
  });
  it("blocks repayment above the balance (balance never negative)", () => {
    expect(() => assertRepaymentAllowed(2000, 2001)).toThrow(DomainError);
    expect(() => assertRepaymentAllowed(2000, 2000)).not.toThrow();
    expect(() => assertRepaymentAllowed(2000, 0)).toThrow(DomainError);
  });
});

describe("receipt allocation", () => {
  it("lines always sum to the bill total to the satang", () => {
    const out = allocateToBillTotal([3500, 1500, 8900, 2500], 15600);
    expect(out.reduce((a, b) => a + b, 0)).toBe(15600);
  });
  it("puts rounding leftovers on the priciest line", () => {
    const out = allocateToBillTotal([100, 100, 100], 100);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(out).toEqual([34, 33, 33]); // ties: first priciest line takes the leftover
  });
  it("leftover goes to the strictly priciest line", () => {
    expect(allocateToBillTotal([100, 500, 100], 100)).toEqual([14, 72, 14]);
  });
  it("discount spreads proportionally", () => {
    expect(allocateToBillTotal([1000, 3000], 3600)).toEqual([900, 2700]);
  });
  it("refuses to allocate onto nothing", () => {
    expect(() => allocateToBillTotal([], 100)).toThrow(DomainError);
  });
});

describe("days (Asia/Bangkok)", () => {
  it("17:00 UTC is already tomorrow in Bangkok", () => {
    expect(bangkokDay(new Date("2026-10-03T16:59:59Z"))).toBe("2026-10-03");
    expect(bangkokDay(new Date("2026-10-03T17:00:00Z"))).toBe("2026-10-04");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("streak (strict: press-log day only)", () => {
  it("counts consecutive days including today", () => {
    expect(computeStreak(["2026-10-01", "2026-10-02", "2026-10-03"], "2026-10-03")).toEqual({
      current: 3,
      loggedToday: true,
      atRisk: false,
    });
  });
  it("is alive but at risk when only yesterday is logged", () => {
    expect(computeStreak(["2026-10-01", "2026-10-02"], "2026-10-03")).toEqual({
      current: 2,
      loggedToday: false,
      atRisk: true,
    });
  });
  it("breaks after a missed day", () => {
    expect(computeStreak(["2026-10-01"], "2026-10-03")).toEqual({
      current: 0,
      loggedToday: false,
      atRisk: false,
    });
  });
  it("a gap stops counting", () => {
    expect(computeStreak(["2026-09-28", "2026-10-02", "2026-10-03"], "2026-10-03").current).toBe(2);
  });
});

describe("xp", () => {
  it("streak 10 first log = +15 (10 x 1.5)", () => {
    expect(xpForFirstLogOfDay(10)).toBe(15);
  });
  it("multipliers by streak", () => {
    expect(xpForFirstLogOfDay(1)).toBe(10);
    expect(xpForFirstLogOfDay(7)).toBe(15);
    expect(xpForFirstLogOfDay(30)).toBe(20);
  });
  it("extra entries give +1 each, capped at +5 per day", () => {
    let earned = 0;
    for (let i = 0; i < 8; i++) earned += xpForExtraEntry(earned);
    expect(earned).toBe(5);
  });
  it("level n -> n+1 costs 100 x n", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNext: 200 });
    expect(levelFromXp(300)).toEqual({ level: 3, xpIntoLevel: 0, xpForNext: 300 });
    expect(levelFromXp(350)).toEqual({ level: 3, xpIntoLevel: 50, xpForNext: 300 });
  });
});
