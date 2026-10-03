import { describe, expect, it } from "vitest";
import { saveReceiptBody } from "./schemas";

const line = { rawName: "ข้าวปั้น", canonicalName: "ข้าวปั้น", qty: 1, price: 3500, owners: { me: true, people: [] } };

describe("saveReceiptBody tolerates AI-produced text", () => {
  it("clips an over-long merchant and names instead of rejecting", () => {
    const r = saveReceiptBody.parse({
      merchant: "ร้าน".repeat(60),
      total: 3500,
      lines: [{ ...line, rawName: "ก".repeat(500), canonicalName: "ข".repeat(300) }],
    });
    expect(r.merchant!.length).toBe(100);
    expect(r.lines[0].rawName.length).toBe(200);
    expect(r.lines[0].canonicalName.length).toBe(100);
  });
  it("trims whitespace", () => {
    expect(saveReceiptBody.parse({ total: 1, lines: [{ ...line, canonicalName: "  นม  " }] }).lines[0].canonicalName).toBe("นม");
  });
  it("still rejects a blank product name, bad money and empty receipts", () => {
    expect(() => saveReceiptBody.parse({ total: 1, lines: [{ ...line, canonicalName: "   " }] })).toThrow();
    expect(() => saveReceiptBody.parse({ total: 0, lines: [line] })).toThrow();
    expect(() => saveReceiptBody.parse({ total: 1.5, lines: [line] })).toThrow();
    expect(() => saveReceiptBody.parse({ total: 100, lines: [] })).toThrow();
    expect(() => saveReceiptBody.parse({ total: 100, lines: [{ ...line, owners: { me: true, people: ["not-a-uuid"] } }] })).toThrow();
  });
});
