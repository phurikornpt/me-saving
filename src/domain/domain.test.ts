import { describe, expect, it } from "vitest";
import { allocateToBillTotal } from "./allocate";
import { DEFAULT_LAYOUT, normalizeLayout, WIDGET_IDS } from "./dashboard-layout";
import { addDays, bangkokDay, bangkokDayRange } from "./day";
import { DomainError } from "./errors";
import { formatBaht, formatCompact, parseBaht } from "./money";
import {
  assertNoNegativeBalance,
  assertRepaymentAllowed,
  balances,
  outstandingByEntry,
  type Ledger,
  type OwedShare,
} from "./ledger";
import { lineShares, sharesFor, sharesOfLines } from "./split";
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

describe("fronting (FR-3): splitting an expense between us and people", () => {
  it("rice 100 split equally with แฟน -> แฟน owes 50", () => {
    expect(sharesFor(10000, { kind: "equal", people: ["fan"] })).toEqual([{ personId: "fan", amount: 5000 }]);
  });
  it("split 3 ways (us + 2): each person owes a third, the odd satang stays with us", () => {
    expect(sharesFor(10000, { kind: "equal", people: ["fan", "a"] })).toEqual([
      { personId: "fan", amount: 3333 },
      { personId: "a", amount: 3333 },
    ]);
  });
  it("all theirs: one person pays it all; two people halve it (odd satang ours)", () => {
    expect(sharesFor(10000, { kind: "theirs", people: ["fan"] })).toEqual([{ personId: "fan", amount: 10000 }]);
    expect(sharesFor(10001, { kind: "theirs", people: ["fan", "a"] })).toEqual([
      { personId: "fan", amount: 5000 },
      { personId: "a", amount: 5000 },
    ]);
  });
  it("none and custom", () => {
    expect(sharesFor(10000, { kind: "none" })).toEqual([]);
    expect(
      sharesFor(10000, { kind: "custom", shares: [{ personId: "fan", amount: 3000 }, { personId: "a", amount: 0 }] }),
    ).toEqual([{ personId: "fan", amount: 3000 }]);
  });
  it("rejects shares above the total, nobody picked, or a person twice", () => {
    expect(() =>
      sharesFor(10000, { kind: "custom", shares: [{ personId: "fan", amount: 6000 }, { personId: "a", amount: 4001 }] }),
    ).toThrow(DomainError);
    expect(() => sharesFor(10000, { kind: "equal", people: [] })).toThrow(DomainError);
    expect(() => sharesFor(10000, { kind: "theirs", people: ["a", "a"] })).toThrow(DomainError);
  });
  it("a line splits equally between its owners", () => {
    expect(lineShares(8901, { me: true, people: ["fan"] })).toEqual([{ personId: "fan", amount: 4450 }]);
    expect(lineShares(1500, { me: false, people: ["fan"] })).toEqual([{ personId: "fan", amount: 1500 }]);
    expect(lineShares(1000, { me: false, people: ["fan", "a"] })).toEqual([
      { personId: "fan", amount: 500 },
      { personId: "a", amount: 500 },
    ]);
    expect(lineShares(3500, { me: true, people: [] })).toEqual([]);
    expect(() => lineShares(100, { me: false, people: [] })).toThrow(DomainError);
  });
  it("rolls receipt lines up into one share per person", () => {
    expect(
      sharesOfLines([
        { price: 3500, owners: { me: true, people: [] } },
        { price: 1500, owners: { me: false, people: ["fan"] } },
        { price: 8900, owners: { me: true, people: ["fan"] } },
        { price: 3000, owners: { me: true, people: ["fan", "a"] } },
      ]),
    ).toEqual([
      { personId: "fan", amount: 1500 + 4450 + 1000 },
      { personId: "a", amount: 1000 },
    ]);
  });
});

describe("balances per person + FIFO", () => {
  const s = (entryId: string, personId: string, day: number, amount: number): OwedShare => ({
    entryId,
    personId,
    occurredAt: new Date(Date.UTC(2026, 9, day)),
    amount,
  });
  const ledger = (repayments: Ledger["repayments"] = []): Ledger => ({
    shares: [s("c", "fan", 3, 20000), s("a", "fan", 1, 5000), s("b", "fan", 2, 8450), s("b", "a", 2, 1000)],
    repayments,
  });

  it("sums each person's shares minus their own repayments", () => {
    expect(balances(ledger())).toEqual(new Map([["fan", 33450], ["a", 1000]]));
    const after = balances(ledger([{ personId: "fan", total: 10000 }]));
    expect(after.get("fan")).toBe(23450);
    expect(after.get("a")).toBe(1000); // someone else's repayment never touches A
  });
  it("applies a person's repayments to their oldest shares first", () => {
    const out = outstandingByEntry(ledger([{ personId: "fan", total: 10000 }]), "fan");
    expect(out.map((o) => [o.entryId, o.outstanding])).toEqual([
      ["b", 3450],
      ["c", 20000],
    ]);
    expect(outstandingByEntry(ledger([{ personId: "fan", total: 10000 }]), "a")).toEqual([
      { entryId: "b", occurredAt: new Date(Date.UTC(2026, 9, 2)), amount: 1000, outstanding: 1000 },
    ]);
  });
  it("fully repaid -> nothing outstanding", () => {
    expect(outstandingByEntry(ledger([{ personId: "fan", total: 33450 }]), "fan")).toEqual([]);
  });
  it("blocks repayment above the balance (balance never negative)", () => {
    expect(() => assertRepaymentAllowed(2000, 2001)).toThrow(DomainError);
    expect(() => assertRepaymentAllowed(2000, 2000)).not.toThrow();
    expect(() => assertRepaymentAllowed(2000, 0)).toThrow(DomainError);
    expect(() => assertNoNegativeBalance(ledger([{ personId: "a", total: 1001 }]))).toThrow(DomainError);
    expect(() => assertNoNegativeBalance(ledger([{ personId: "a", total: 1000 }]))).not.toThrow();
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
  it("a Bangkok day spans 17:00Z to 17:00Z", () => {
    const { start, end } = bangkokDayRange("2026-10-04");
    expect(start.toISOString()).toBe("2026-10-03T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-04T17:00:00.000Z");
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

describe("dashboard layout", () => {
  it("falls back to the defaults for garbage", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout([])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout("x")).toEqual(DEFAULT_LAYOUT);
  });
  it("keeps the user's order and toggles, drops unknown/duplicate ids", () => {
    const out = normalizeLayout([
      { id: "calendar", enabled: true },
      { id: "nope", enabled: true },
      { id: "streak", enabled: false },
      { id: "calendar", enabled: false },
    ]);
    expect(out.slice(0, 2)).toEqual([
      { id: "calendar", enabled: true },
      { id: "streak", enabled: false },
    ]);
    expect(out.map((i) => i.id).sort()).toEqual([...WIDGET_IDS].sort());
  });
  it("appends widgets added in later versions as enabled", () => {
    const out = normalizeLayout([{ id: "streak", enabled: true }]);
    expect(out.find((i) => i.id === "calendar")).toEqual({ id: "calendar", enabled: true });
  });
});
