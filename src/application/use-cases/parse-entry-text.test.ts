import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import type { CategoryRecord, LoginAttemptRepo, ParsedEntries, ParsedEntry, ParsedEntryItem, TextEntryParser } from "../ports";
import { MAX_ENTRY_TEXT, ParseEntryText } from "./parse-entry-text";

const NOON = new Date("2026-10-03T05:00:00Z");
const cats: CategoryRecord[] = [
  { id: "c-food", name: "อาหาร", icon: "restaurant", kind: "expense", sort: 0, archived: false },
  { id: "c-old", name: "เก่า", icon: "more_horiz", kind: "expense", sort: 1, archived: true },
  { id: "c-pay", name: "เงินเดือน", icon: "savings", kind: "income", sort: 2, archived: false },
];
// createFakeRepos seeds people [p-fan, p-a] and wallets [w-cash (default), w-bank], so the keys are p1,p2 / w1,w2.
const ITEM: ParsedEntryItem = { note: "ข้าวมันไก่", amount: 6000, categoryName: "อาหาร", me: true, personKeys: ["p1"], uncertain: [] };
const ENTRY: ParsedEntry = { kind: "expense", name: null, walletKey: null, items: [ITEM], uncertain: [] };
const PARSED: ParsedEntries = { entries: [ENTRY] };
/** One entry with these overrides on its first item (and on the entry itself). */
const one = (item: Partial<ParsedEntryItem> = {}, entry: Partial<ParsedEntry> = {}): ParsedEntries => ({
  entries: [{ ...ENTRY, ...entry, items: [{ ...ITEM, ...item }] }],
});

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

function setup(parsed: ParsedEntries | Error = PARSED, perDay: number | null = 20) {
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
    const { uc, seen } = setup(one({}, { walletKey: "w2" }));
    const { drafts } = await uc.execute("  ข้าวมันไก่ 60 หารแฟน ");
    expect(drafts).toEqual([
      {
        mode: "single", kind: "expense", amount: 6000, categoryId: "c-food", note: "ข้าวมันไก่",
        split: "equal", personIds: ["p-fan"], walletId: "w-bank", uncertain: [],
      },
    ]);
    expect(seen[0].people.map((p) => p.key)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(seen[0])).not.toContain("p-fan"); // ids never reach the model
    expect(seen[0].categories).toEqual([
      { name: "อาหาร", kind: "expense" },
      { name: "เงินเดือน", kind: "income" },
    ]);
  });

  it("ignores keys, wallets and categories the model invented, and marks them uncertain", async () => {
    const { uc } = setup(one({ categoryName: "ของที่ไม่มี", personKeys: ["p9"] }, { walletKey: "w9" }));
    const [d] = (await uc.execute("ข้าว 60 หารใครไม่รู้")).drafts;
    expect(d).toMatchObject({ categoryId: null, split: "none", personIds: [], walletId: null });
    expect(d.uncertain).toEqual(expect.arrayContaining(["category", "person", "wallet"]));
  });

  it("keeps valid people next to invented ones, once each", async () => {
    const { uc } = setup(one({ personKeys: ["p1", "p1", "pX", "p2"] }));
    expect((await uc.execute("x")).drafts[0]).toMatchObject({ personIds: ["p-fan", "p-a"] });
  });

  it("does not accept an archived category or one of the wrong kind", async () => {
    expect((await setup(one({ categoryName: "เก่า" })).uc.execute("x")).drafts[0]).toMatchObject({ categoryId: null });
    expect((await setup(one({ categoryName: "เงินเดือน" })).uc.execute("x")).drafts[0]).toMatchObject({ categoryId: null }); // expense named an income category
  });

  it("an income has no split and takes income categories", async () => {
    const parsed = one({ categoryName: "เงินเดือน", amount: 2500000, me: false, personKeys: ["p1"] }, { kind: "income" });
    const [d] = (await setup(parsed).uc.execute("เงินเดือน 25000")).drafts;
    expect(d).toMatchObject({ mode: "single", kind: "income", categoryId: "c-pay", split: "none", personIds: [] });
  });

  it("a missing amount is flagged, and the model's own doubts are kept", async () => {
    const [d] = (await setup(one({ amount: null, uncertain: ["category"] })).uc.execute("ข้าวมันไก่")).drafts;
    expect(d).toMatchObject({ amount: null });
    expect(d.uncertain).toEqual(expect.arrayContaining(["amount", "category"]));
  });

  it("single expense: people + me = equal, people without me = theirs, nobody = none", async () => {
    const split = async (item: Partial<ParsedEntryItem>) => (await setup(one(item)).uc.execute("x")).drafts[0];
    expect(await split({ me: true, personKeys: ["p1"] })).toMatchObject({ split: "equal", personIds: ["p-fan"] });
    expect(await split({ me: false, personKeys: ["p1"] })).toMatchObject({ split: "theirs", personIds: ["p-fan"] });
    expect(await split({ me: true, personKeys: [] })).toMatchObject({ split: "none", personIds: [] });
  });

  it("someone said to pay for, but nobody valid: ours, and the person is flagged", async () => {
    const [d] = (await setup(one({ me: false, personKeys: ["p9"] })).uc.execute("x")).drafts;
    expect(d).toMatchObject({ split: "none", personIds: [] });
    expect(d.uncertain).toContain("person");
  });

  it("an expense with several items becomes one group with per-line owners", async () => {
    const parsed: ParsedEntries = {
      entries: [
        {
          ...ENTRY,
          name: " ค่า 7-11 ",
          walletKey: "w2",
          items: [
            { ...ITEM, note: "นม", amount: 3000, me: false, personKeys: ["p1"] },
            { ...ITEM, note: "ไก่", amount: null, me: true, personKeys: [], categoryName: "ไม่มี" },
            { ...ITEM, note: "น้ำ", amount: 2000, me: true, personKeys: ["p1", "p2"] },
          ],
        },
      ],
    };
    const { drafts } = await setup(parsed).uc.execute("x");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      mode: "group", name: "ค่า 7-11", walletId: "w-bank", personIds: ["p-fan", "p-a"], uncertain: [],
      lines: [
        { note: "นม", amount: 3000, categoryId: "c-food", owners: { me: false, people: ["p-fan"] }, uncertain: [] },
        { note: "ไก่", amount: null, categoryId: null, owners: { me: true, people: [] }, uncertain: expect.arrayContaining(["amount", "category"]) },
        { note: "น้ำ", amount: 2000, categoryId: "c-food", owners: { me: true, people: ["p-fan", "p-a"] }, uncertain: [] },
      ],
    });
  });

  it("one sentence can give several drafts: income and expense apart, income items one each", async () => {
    const parsed: ParsedEntries = {
      entries: [
        {
          ...ENTRY, kind: "income", walletKey: "w9",
          items: [
            { ...ITEM, note: "เงินเดือน", amount: 2500000, categoryName: "เงินเดือน", personKeys: [] },
            { ...ITEM, note: "โบนัส", amount: 100000, categoryName: null, personKeys: [] },
          ],
        },
        ENTRY,
      ],
    };
    const { drafts } = await setup(parsed).uc.execute("x");
    expect(drafts.map((d) => d.mode)).toEqual(["single", "single", "single"]);
    expect(drafts.map((d) => d.mode === "single" && d.kind)).toEqual(["income", "income", "expense"]);
    expect(drafts[0].uncertain).toContain("wallet");
    expect(drafts[2].uncertain).not.toContain("wallet");
  });

  it("a result with no entries is AI_UNAVAILABLE", async () => {
    await expect(setup({ entries: [] }).uc.execute("x")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
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
