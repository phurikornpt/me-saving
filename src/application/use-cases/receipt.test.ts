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
    { rawName: "ข้าวปั้นแซลมอน", canonicalName: "ข้าวปั้น", qty: 1, price: 3500, categoryName: "อาหาร", owner: "me", confident: true },
    { rawName: "DUTCHMILL YOG STRAW", canonicalName: "นมเปรี้ยว", qty: 1, price: 1500, categoryName: "อาหาร", owner: "partner", confident: true },
    { rawName: "แชมพู ซันซิล", canonicalName: "แชมพู", qty: 1, price: 8900, categoryName: null, owner: "split", confident: false },
    { rawName: "ลูกอม", canonicalName: "ลูกอม", qty: 1, price: 2500, categoryName: "อาหาร", owner: "partner", confident: false },
  ],
};

function setupParse(parsed: ParsedReceipt = RECEIPT) {
  const f = createFakeRepos();
  const seen: { partnerNote: string; knownNames: string[]; categoryNames: string[] }[] = [];
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
    { get: async () => ({ partnerNote: "ชอบนมเปรี้ยว", dashboardLayout: [] }), update: async () => ({ partnerNote: "", dashboardLayout: [] }) },
    b,
    new FixedClock(NOON),
  );
  return { f, uc, seen, b };
}

describe("ParseReceipt", () => {
  it("owner order: memory > AI (when confident) > default 'me' flagged low-confidence", async () => {
    const { f, uc } = setupParse();
    f.memory.set("นมเปรี้ยว", "split"); // the user once chose split; that beats the AI's "partner"
    const draft = await uc.execute(img);
    const by = Object.fromEntries(draft.lines.map((l) => [l.canonicalName, l]));
    expect(by["นมเปรี้ยว"]).toMatchObject({ owner: "split", ownerSource: "memory", lowConfidence: false });
    expect(by["ข้าวปั้น"]).toMatchObject({ owner: "me", ownerSource: "ai", lowConfidence: false });
    expect(by["แชมพู"]).toMatchObject({ owner: "me", ownerSource: "default", lowConfidence: true });
    expect(by["ลูกอม"]).toMatchObject({ owner: "me", ownerSource: "default", lowConfidence: true });
  });

  it("gives the AI the partner note, remembered names and only active expense categories", async () => {
    const { f, uc, seen } = setupParse();
    f.memory.set("นมเปรี้ยว", "partner");
    await uc.execute(img);
    expect(seen[0]).toEqual({ partnerNote: "ชอบนมเปรี้ยว", knownNames: ["นมเปรี้ยว"], categoryNames: ["อาหาร"] });
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
      { get: async () => ({ partnerNote: "", dashboardLayout: [] }), update: async () => ({ partnerNote: "", dashboardLayout: [] }) },
      b, new FixedClock(NOON),
    );
    for (let i = 0; i < MAX_PARSES_PER_DAY; i++) await expect(uc.execute(img)).rejects.toThrow("quota");
    await expect(uc.execute(img)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("SaveReceiptEntry", () => {
  const lines = RECEIPT.lines.map((l) => ({
    rawName: l.rawName, canonicalName: l.canonicalName, qty: l.qty, price: l.price, owner: l.owner,
  }));

  function setupSave() {
    const f = createFakeRepos();
    return { f, uc: new SaveReceiptEntry(f.tx, new FixedClock(NOON)) };
  }

  it("1 receipt = 1 expense; partner share = partner lines + half of split lines (odd satang ours)", async () => {
    const { f, uc } = setupSave();
    const out = await uc.execute({ merchant: "7-Eleven", total: 16400, lines });
    expect(f.entries).toHaveLength(1);
    expect(out.entry).toMatchObject({ kind: "expense", source: "receipt", total: 16400, partnerShare: 1500 + 4450 + 2500 });
    expect(f.lines).toHaveLength(4);
  });

  it("allocates a bill-level discount so lines sum to the paid total to the satang", async () => {
    const { f, uc } = setupSave();
    await uc.execute({ total: 15000, lines }); // printed 16400, paid 15000
    expect(f.lines.reduce((s, l) => s + l.price, 0)).toBe(15000);
  });

  it("remembers every line's owner for next time (and the last choice wins)", async () => {
    const { f, uc } = setupSave();
    f.memory.set("ลูกอม", "me");
    await uc.execute({ total: 16400, lines });
    expect(f.memory.get("นมเปรี้ยว")).toBe("partner");
    expect(f.memory.get("แชมพู")).toBe("split");
    expect(f.memory.get("ลูกอม")).toBe("partner");
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
    expect(f.entries).toHaveLength(0);
  });
});
