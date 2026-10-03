import { describe, expect, it } from "vitest";
import { NEXT_OWNER, summarize, type DraftLine } from "./receiptMath";

const line = (price: number, owner: DraftLine["owner"]): DraftLine => ({
  key: String(Math.random()), rawName: "x", canonicalName: "x", qty: 1, price, categoryId: null, owner, lowConfidence: false,
});

describe("receipt review summary", () => {
  it("splits by owner (split halves, odd satang stays ours)", () => {
    const s = summarize([line(3500, "me"), line(1500, "partner"), line(8901, "split")], 13901);
    expect(s.partner).toBe(1500 + 4450);
    expect(s.mine + s.partner).toBe(13901);
    expect(s.mismatch).toBe(false);
  });
  it("allocates a bill discount proportionally and flags the mismatch", () => {
    const s = summarize([line(1000, "me"), line(3000, "partner")], 3600);
    expect(s.partner).toBe(2700);
    expect(s.mine).toBe(900);
    expect(s.mismatch).toBe(true);
  });
  it("is not valid when there is nothing to split", () => {
    expect(summarize([], 100).valid).toBe(false);
    expect(summarize([line(100, "me")], 0).valid).toBe(false);
  });
  it("owner chip cycles me -> partner -> split -> me", () => {
    expect(NEXT_OWNER.me).toBe("partner");
    expect(NEXT_OWNER.partner).toBe("split");
    expect(NEXT_OWNER.split).toBe("me");
  });
});
