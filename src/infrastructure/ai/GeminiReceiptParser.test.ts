import { describe, expect, it, vi } from "vitest";
import { isNonProduct } from "./GeminiReceiptParser";

describe("isNonProduct (guards against a small model listing discounts as products)", () => {
  it.each(["ส่วนลดสมาชิก", "ส่วนลด", "โปรโมชั่น 1 แถม 1", "คูปองส่วนลด", "แต้มสะสม", "VAT 7%", "Member Discount", "เงินทอน", "ภาษีมูลค่าเพิ่ม"])(
    "drops %s",
    (name) => expect(isNonProduct(name)).toBe(true),
  );
  it.each(["ข้าวปั้นแซลมอน", "ดัชมิลล์ นมเปรี้ยว สตรอ", "ซันซิล แชมพู 70มล", "ขนมปังไส้ครีม", "Coca-Cola 325ml"])(
    "keeps %s",
    (name) => expect(isNonProduct(name)).toBe(false),
  );
});

describe("transient Gemini failures", () => {
  it("retries once on 503, then succeeds", async () => {
    vi.resetModules();
    const calls: number[] = [];
    vi.doMock("@google/genai", async (orig) => {
      const real = await orig<typeof import("@google/genai")>();
      return {
        ...real,
        GoogleGenAI: class {
          models = {
            generateContent: async () => {
              calls.push(1);
              if (calls.length === 1) throw new real.ApiError({ message: "overloaded", status: 503 });
              return { text: JSON.stringify({ merchant: null, date: "2569-10-03", total_paid: 35, lines: [{ raw_name: "ข้าวปั้น", canonical_name: "ข้าวปั้น", quantity: 1, line_total: 35, category: null, owner: "me", confident: true }] }) };
            },
          };
        },
      };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    const out = await createGeminiReceiptParser({ apiKey: "k", retryDelayMs: 0 }).parse(
      { data: new Uint8Array([1]), mimeType: "image/jpeg" },
      { partnerNote: "", knownNames: [], categoryNames: [] },
    );
    expect(calls).toHaveLength(2);
    expect(out).toMatchObject({ date: "2026-10-03", total: 3500 }); // Buddhist year converted
    vi.doUnmock("@google/genai");
  });

  it("does not retry quota errors (429) and reports AI_UNAVAILABLE", async () => {
    vi.resetModules();
    let n = 0;
    vi.doMock("@google/genai", async (orig) => {
      const real = await orig<typeof import("@google/genai")>();
      return {
        ...real,
        GoogleGenAI: class {
          models = { generateContent: async () => { n++; throw new real.ApiError({ message: "quota", status: 429 }); } };
        },
      };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    await expect(
      createGeminiReceiptParser({ apiKey: "k", retryDelayMs: 0 }).parse(
        { data: new Uint8Array([1]), mimeType: "image/jpeg" },
        { partnerNote: "", knownNames: [], categoryNames: [] },
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(n).toBe(1);
    vi.doUnmock("@google/genai");
  });
});
