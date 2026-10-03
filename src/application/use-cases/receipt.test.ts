import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import type {
  CategoryRecord,
  LoginAttemptRepo,
  ParsedReceipt,
  ReceiptParser,
} from "../ports";
import { MAX_PARSES_PER_DAY, ParseReceipt } from "./parse-receipt";
import { SaveReceiptEntry } from "./save-receipt-entry";

const NOON = new Date("2026-10-03T05:00:00Z");
const FAN = "p-fan"; // seeded by createFakeRepos, with the note "ชอบนมเปรี้ยว"
const A = "p-a";
const ME = { me: true, people: [] };
const own = (...people: string[]) => ({ me: false, people });
const shared = (...people: string[]) => ({ me: true, people });
const img = { data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };

const cats: CategoryRecord[] = [
  { id: "c1", name: "อาหาร", icon: "restaurant", kind: "expense", sort: 0, archived: false },
  { id: "c2", name: "เก่า", icon: "more_horiz", kind: "expense", sort: 1, archived: true },
];

function budget(): LoginAttemptRepo & { n: number } {
  const log: Date[] = [];
  return {
    get n() {
      return log.length;
    },
    async countSince(_k, since) {
      return log.filter((d) => d >= since).length;
    },
    async record(_k, at) {
      log.push(at);
    },
    async clear() {},
  };
}

const RECEIPT: ParsedReceipt = {
  merchant: "7-Eleven",
  date: "2026-10-03",
  total: 16400,
  lines: [
    { rawName: "ข้าวปั้นแซลมอน", canonicalName: "ข้าวปั้น", qty: 1, price: 3500, categoryName: "อาหาร", owners: ME, confident: true },
    { rawName: "DUTCHMILL YOG STRAW", canonicalName: "นมเปรี้ยว", qty: 1, price: 1500, categoryName: "อาหาร", owners: own(FAN), confident: true },
    { rawName: "แชมพู ซันซิล", canonicalName: "แชมพู", qty: 1, price: 8900, categoryName: null, owners: shared(FAN), confident: false },
    { rawName: "ลูกอม", canonicalName: "ลูกอม", qty: 1, price: 2500, categoryName: "อาหาร", owners: own(FAN), confident: false },
  ],
};

function setupParse(parsed: ParsedReceipt = RECEIPT) {
  const f = createFakeRepos();
  const seen: Parameters<ReceiptParser["parse"]>[1][] = [];
  const parser: ReceiptParser = {
    async parse(_img, ctx) {
      seen.push(ctx);
      return parsed;
    },
  };
  const b = budget();
  const uc = new ParseReceipt(
    parser,
    f.repos.ownerMemory,
    { list: async () => cats, create: async () => cats[0], update: async () => null },
    f.repos.people,
    b,
    new FixedClock(NOON),
  );
  return { f, uc, seen, b };
}

describe("ParseReceipt", () => {
  it("a plain scan (nobody picked) only reads the lines: all ours, no guessing, memory unused", async () => {
    const { f, uc, seen } = setupParse();
    f.memory.set("นมเปรี้ยว", own(FAN));
    const draft = await uc.execute(img);
    expect(seen[0].people).toEqual([]);
    expect(draft.lines.every((l) => l.owners.me && l.owners.people.length === 0 && !l.lowConfidence)).toBe(true);
  });

  it("owner order on a shared bill: memory > AI (when confident) > default 'me' flagged low-confidence", async () => {
    const { f, uc } = setupParse();
    f.memory.set("นมเปรี้ยว", shared(FAN)); // the user once chose หาร; that beats the AI's "แฟน"
    const draft = await uc.execute(img, [FAN]);
    const by = Object.fromEntries(draft.lines.map((l) => [l.canonicalName, l]));
    expect(by["นมเปรี้ยว"]).toMatchObject({ owners: shared(FAN), ownerSource: "memory", lowConfidence: false });
    expect(by["ข้าวปั้น"]).toMatchObject({ owners: ME, ownerSource: "ai", lowConfidence: false });
    expect(by["แชมพู"]).toMatchObject({ owners: ME, ownerSource: "default", lowConfidence: true });
    expect(by["ลูกอม"]).toMatchObject({ owners: ME, ownerSource: "default", lowConfidence: true });
  });

  it("memory is narrowed to who is on this bill, and skipped when none of them are", async () => {
    const { f, uc } = setupParse();
    f.memory.set("แชมพู", shared(FAN, A)); // shared by three last time; today A isn't here
    f.memory.set("นมเปรี้ยว", own(A)); //      A's; A isn't here, so fall back to the AI
    const by = Object.fromEntries((await uc.execute(img, [FAN])).lines.map((l) => [l.canonicalName, l]));
    expect(by["แชมพู"]).toMatchObject({ owners: shared(FAN), ownerSource: "memory" });
    expect(by["นมเปรี้ยว"]).toMatchObject({ owners: own(FAN), ownerSource: "ai" });
  });

  it("ignores an AI guess that names someone who isn't on the bill", async () => {
    const { uc } = setupParse();
    const by = Object.fromEntries((await uc.execute(img, [A])).lines.map((l) => [l.canonicalName, l]));
    expect(by["นมเปรี้ยว"]).toMatchObject({ owners: ME, ownerSource: "default", lowConfidence: true });
  });

  it("gives the AI the picked people with their notes, remembered names and only active expense categories", async () => {
    const { f, uc, seen } = setupParse();
    f.memory.set("นมเปรี้ยว", own(FAN));
    await uc.execute(img, [FAN]);
    expect(seen[0]).toEqual({
      people: [{ id: FAN, name: "แฟน", note: "ชอบนมเปรี้ยว" }],
      knownNames: ["นมเปรี้ยว"],
      categoryNames: ["อาหาร"],
    });
  });

  it("refuses an unknown person before spending quota", async () => {
    const { uc, b } = setupParse();
    await expect(uc.execute(img, ["ghost"])).rejects.toMatchObject({ code: "UNKNOWN_PERSON" });
    expect(b.n).toBe(0);
  });

  it("flags when printed lines don't add up to the paid total", async () => {
    const { uc } = setupParse({ ...RECEIPT, total: 15000 }); // lines sum to 16400
    expect((await uc.execute(img)).sumMismatch).toBe(true);
  });

  it("no mismatch when lines equal the total", async () => {
    const { uc } = setupParse({ ...RECEIPT, total: 3500 + 1500 + 8900 + 2500 });
    expect((await uc.execute(img)).sumMismatch).toBe(false);
  });

  it("rejects bad images before spending quota", async () => {
    const { uc, b } = setupParse();
    await expect(uc.execute({ data: new Uint8Array(), mimeType: "image/jpeg" })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(uc.execute({ data: new Uint8Array([1]), mimeType: "image/gif" })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(uc.execute({ data: new Uint8Array(4 * 1024 * 1024 + 1), mimeType: "image/png" })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    expect(b.n).toBe(0);
  });

  it(`stops after ${MAX_PARSES_PER_DAY} scans a day, and failed AI calls still count`, async () => {
    const f = createFakeRepos();
    const b = budget();
    const failing: ReceiptParser = { parse: async () => { throw new Error("quota"); } };
    const uc = new ParseReceipt(
      failing, f.repos.ownerMemory,
      { list: async () => [], create: async () => cats[0], update: async () => null },
      f.repos.people,
      b, new FixedClock(NOON),
    );
    for (let i = 0; i < MAX_PARSES_PER_DAY; i++) await expect(uc.execute(img)).rejects.toThrow("quota");
    await expect(uc.execute(img)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("scan limit per account", () => {
  it("perDay null: every scan is counted under the account's key but none is blocked", async () => {
    const f = createFakeRepos();
    const keys: string[] = [];
    const b = budget();
    const counting = { ...b, record: async (k: string, at: Date) => { keys.push(k); await b.record(k, at); } };
    const uc = new ParseReceipt(
      { parse: async () => RECEIPT }, f.repos.ownerMemory,
      { list: async () => cats, create: async () => cats[0], update: async () => null },
      f.repos.people, counting, new FixedClock(NOON), { key: "receipt-parse:u1", perDay: null },
    );
    for (let i = 0; i < MAX_PARSES_PER_DAY + 5; i++) await uc.execute(img);
    expect(keys).toHaveLength(MAX_PARSES_PER_DAY + 5);
    expect(new Set(keys)).toEqual(new Set(["receipt-parse:u1"]));
  });
});

describe("SaveReceiptEntry", () => {
  const lines = RECEIPT.lines.map((l) => ({
    rawName: l.rawName, canonicalName: l.canonicalName, qty: l.qty, price: l.price, owners: l.owners,
  }));

  function setupSave() {
    const f = createFakeRepos();
    return { f, uc: new SaveReceiptEntry(f.tx, new FixedClock(NOON)) };
  }

  it("1 receipt = 1 expense; a person owes their lines + their part of shared lines (odd satang ours)", async () => {
    const { f, uc } = setupSave();
    const out = await uc.execute({ merchant: "7-Eleven", total: 16400, lines });
    expect(f.entries).toHaveLength(1);
    expect(out.entry).toMatchObject({ kind: "expense", source: "receipt", total: 16400, othersShare: 1500 + 4450 + 2500 });
    expect(out.entry.shares).toEqual([{ personId: FAN, amount: 1500 + 4450 + 2500 }]);
    expect(f.lines).toHaveLength(4);
  });

  it("splits between several people line by line", async () => {
    const { uc } = setupSave();
    const out = await uc.execute({
      total: 9000,
      lines: [
        { rawName: "a", canonicalName: "a", qty: 1, price: 3000, owners: shared(FAN, A) }, // 1000 each
        { rawName: "b", canonicalName: "b", qty: 1, price: 4000, owners: own(FAN, A) }, //    2000 each
        { rawName: "c", canonicalName: "c", qty: 1, price: 2000, owners: own(A) },
      ],
    });
    expect(out.entry.shares).toEqual([
      { personId: FAN, amount: 3000 },
      { personId: A, amount: 5000 },
    ]);
  });

  it("allocates a bill-level discount so lines sum to the paid total to the satang", async () => {
    const { f, uc } = setupSave();
    await uc.execute({ total: 15000, lines }); // printed 16400, paid 15000
    expect(f.lines.reduce((s, l) => s + l.price, 0)).toBe(15000);
  });

  it("remembers every line's owners for next time (and the last choice wins)", async () => {
    const { f, uc } = setupSave();
    f.memory.set("ลูกอม", ME);
    await uc.execute({ total: 16400, lines });
    expect(f.memory.get("นมเปรี้ยว")).toEqual(own(FAN));
    expect(f.memory.get("แชมพู")).toEqual(shared(FAN));
    expect(f.memory.get("ลูกอม")).toEqual(own(FAN));
  });

  it("a plain scan teaches nothing, and a bill without someone doesn't overwrite what we know about them", async () => {
    const { f, uc } = setupSave();
    f.memory.set("นมเปรี้ยว", own(FAN));
    const mine = lines.map((l) => ({ ...l, owners: ME }));
    await uc.execute({ total: 16400, lines: mine, people: [] });
    expect(f.memory.get("นมเปรี้ยว")).toEqual(own(FAN));
    expect(f.memory.has("ข้าวปั้น")).toBe(false);

    await uc.execute({ total: 16400, lines: mine, people: [A] }); // shared with A only: แฟน's milk isn't touched
    expect(f.memory.get("นมเปรี้ยว")).toEqual(own(FAN));
    expect(f.memory.get("ข้าวปั้น")).toEqual(ME);
  });

  it("counts as logging today (+10 XP, streak 1)", async () => {
    const { uc } = setupSave();
    expect(await uc.execute({ total: 16400, lines })).toMatchObject({ xpGained: 10, streak: 1 });
  });

  it("validates input", async () => {
    const { uc, f } = setupSave();
    await expect(uc.execute({ total: 0, lines })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(uc.execute({ total: 100, lines: [] })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(uc.execute({ total: 100, lines: [{ ...lines[0], qty: 0 }] })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(uc.execute({ total: 100, lines: [{ ...lines[0], owners: own() }] })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    await expect(uc.execute({ total: 1500, lines: [lines[1]], people: [A] })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    await expect(uc.execute({ total: 1500, lines: [{ ...lines[1], owners: own("ghost") }] })).rejects.toMatchObject({
      code: "UNKNOWN_PERSON",
    });
    expect(f.entries).toHaveLength(0);
  });
});
