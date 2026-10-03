import { describe, expect, it } from "vitest";
import { nextOwners, summarize, type DraftLine } from "./receiptMath";

const ME = { me: true, people: [] };
const line = (price: number, owners: DraftLine["owners"]): DraftLine => ({
  key: String(Math.random()), rawName: "x", canonicalName: "x", qty: 1, price, categoryId: null, owners, lowConfidence: false,
});

describe("receipt review summary", () => {
  it("splits by owners (shared lines divide equally, odd satang stays ours)", () => {
    const s = summarize([line(3500, ME), line(1500, { me: false, people: ["fan"] }), line(8901, { me: true, people: ["fan"] })], 13901);
    expect(s.shares).toEqual([{ personId: "fan", amount: 1500 + 4450 }]);
    expect(s.mine + s.others).toBe(13901);
    expect(s.mismatch).toBe(false);
  });
  it("shows each person separately", () => {
    const s = summarize([line(3000, { me: true, people: ["fan", "a"] }), line(1000, { me: false, people: ["a"] })], 4000);
    expect(s.shares).toEqual([{ personId: "fan", amount: 1000 }, { personId: "a", amount: 2000 }]);
    expect(s.mine).toBe(1000);
  });
  it("allocates a bill discount proportionally and flags the mismatch", () => {
    const s = summarize([line(1000, ME), line(3000, { me: false, people: ["fan"] })], 3600);
    expect(s.others).toBe(2700);
    expect(s.mine).toBe(900);
    expect(s.mismatch).toBe(true);
  });
  it("is not valid when there is nothing to split", () => {
    expect(summarize([], 100).valid).toBe(false);
    expect(summarize([line(100, ME)], 0).valid).toBe(false);
  });
  it("with one person on the bill the chip cycles เรา -> them -> หาร -> เรา", () => {
    const them = nextOwners(ME, "fan");
    expect(them).toEqual({ me: false, people: ["fan"] });
    const both = nextOwners(them, "fan");
    expect(both).toEqual({ me: true, people: ["fan"] });
    expect(nextOwners(both, "fan")).toEqual(ME);
  });
});
