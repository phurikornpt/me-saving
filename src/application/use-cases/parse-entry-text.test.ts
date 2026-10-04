import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import type { CategoryRecord, LoginAttemptRepo, ParsedEntryText, TextEntryParser } from "../ports";
import { MAX_ENTRY_TEXT, ParseEntryText } from "./parse-entry-text";

const NOON = new Date("2026-10-03T05:00:00Z");
const cats: CategoryRecord[] = [
  { id: "c-food", name: "อาหาร", icon: "restaurant", kind: "expense", sort: 0, archived: false },
  { id: "c-old", name: "เก่า", icon: "more_horiz", kind: "expense", sort: 1, archived: true },
  { id: "c-pay", name: "เงินเดือน", icon: "savings", kind: "income", sort: 2, archived: false },
];
// createFakeRepos seeds people [p-fan, p-a] and wallets [w-cash (default), w-bank], so the keys are p1,p2 / w1,w2.
const PARSED: ParsedEntryText = {
  kind: "expense", amount: 6000, categoryName: "อาหาร", note: "ข้าวมันไก่",
  split: "equal", personKeys: ["p1"], walletKey: null, uncertain: [],
};

function budget(): LoginAttemptRepo & { n: number; keys: string[] } {
  const log: Date[] = [];
  const keys: string[] = [];
  return {
    get n() { return log.length; },
    keys,
    async countSince(_k, since) { return log.filter((d) => d >= since).length; },
    async record(k, at) { keys.push(k); log.push(at); },
    async clear() {},
  };
}

function setup(parsed: ParsedEntryText | Error = PARSED, perDay: number | null = 20) {
  const f = createFakeRepos();
  const seen: Parameters<TextEntryParser["parse"]>[1][] = [];
  const parser: TextEntryParser = {
    async parse(_t, ctx) {
      seen.push(ctx);
      if (parsed instanceof Error) throw parsed;
      return parsed;
    },
  };
  const b = budget();
  const uc = new ParseEntryText(
    parser,
    { list: async () => cats, create: async () => cats[0], update: async () => null },
    f.repos.people,
    f.repos.wallets,
    b,
    new FixedClock(NOON),
    { key: "ai:u1", perDay },
  );
  return { uc, seen, b };
}

describe("ParseEntryText", () => {
  it("turns keys back into ids and gives the model only keys, names and active categories", async () => {
    const { uc, seen } = setup({ ...PARSED, walletKey: "w2" });
    const d = await uc.execute("  ข้าวมันไก่ 60 หารแฟน ");
    expect(d).toEqual({
      kind: "expense", amount: 6000, categoryId: "c-food", note: "ข้าวมันไก่",
      split: "equal", personIds: ["p-fan"], walletId: "w-bank", uncertain: [],
    });
    expect(seen[0].people.map((p) => p.key)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(seen[0])).not.toContain("p-fan"); // ids never reach the model
    expect(seen[0].categories).toEqual([
      { name: "อาหาร", kind: "expense" },
      { name: "เงินเดือน", kind: "income" },
    ]);
  });

  it("ignores keys, wallets and categories the model invented, and marks them uncertain", async () => {
    const { uc } = setup({ ...PARSED, categoryName: "ของที่ไม่มี", personKeys: ["p9"], walletKey: "w9" });
    const d = await uc.execute("ข้าว 60 หารใครไม่รู้");
    expect(d).toMatchObject({ categoryId: null, split: "none", personIds: [], walletId: null });
    expect(d.uncertain).toEqual(expect.arrayContaining(["category", "person", "wallet"]));
  });

  it("keeps valid people next to invented ones, once each", async () => {
    const { uc } = setup({ ...PARSED, personKeys: ["p1", "p1", "pX", "p2"] });
    expect((await uc.execute("x")).personIds).toEqual(["p-fan", "p-a"]);
  });

  it("does not accept an archived category or one of the wrong kind", async () => {
    expect((await setup({ ...PARSED, categoryName: "เก่า" }).uc.execute("x")).categoryId).toBeNull();
    expect((await setup({ ...PARSED, categoryName: "เงินเดือน" }).uc.execute("x")).categoryId).toBeNull(); // expense named an income category
  });

  it("an income has no split and takes income categories", async () => {
    const d = await setup({ ...PARSED, kind: "income", categoryName: "เงินเดือน", amount: 2500000, split: "equal", personKeys: ["p1"] }).uc.execute("เงินเดือน 25000");
    expect(d).toMatchObject({ kind: "income", categoryId: "c-pay", split: "none", personIds: [] });
  });

  it("a missing amount is flagged, and the model's own doubts are kept", async () => {
    const d = await setup({ ...PARSED, amount: null, uncertain: ["category"] }).uc.execute("ข้าวมันไก่");
    expect(d.amount).toBeNull();
    expect(d.uncertain).toEqual(expect.arrayContaining(["amount", "category"]));
  });

  it("rejects empty and over-long text without spending any budget", async () => {
    const { uc, b } = setup();
    await expect(uc.execute("   ")).rejects.toMatchObject({ code: "INVALID_TEXT" });
    await expect(uc.execute("ก".repeat(MAX_ENTRY_TEXT + 1))).rejects.toMatchObject({ code: "INVALID_TEXT" });
    await expect(uc.execute("ก".repeat(MAX_ENTRY_TEXT))).resolves.toBeDefined();
    expect(b.n).toBe(1);
  });

  it("counts every call under the shared per-account AI key, failed ones too", async () => {
    const { uc, b } = setup(new DomainError("AI_UNAVAILABLE"));
    await expect(uc.execute("x")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(b.n).toBe(1);
    expect(b.keys).toEqual(["ai:u1"]);
  });

  it("over the daily limit => RATE_LIMITED, and the model is not called", async () => {
    const { uc, seen, b } = setup(PARSED, 2);
    await uc.execute("a");
    await uc.execute("b");
    await expect(uc.execute("c")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(seen).toHaveLength(2);
    expect(b.n).toBe(2);
  });

  it("perDay null counts but never blocks", async () => {
    const { uc, b } = setup(PARSED, null);
    for (let i = 0; i < 25; i++) await uc.execute("x");
    expect(b.n).toBe(25);
  });
});
