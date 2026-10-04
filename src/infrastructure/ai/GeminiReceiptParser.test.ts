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
              return { text: JSON.stringify({ kind: "receipt", fees: [], merchant: null, date: "2569-10-03", total_paid: 35, lines: [{ raw_name: "ข้าวปั้น", canonical_name: "ข้าวปั้น", quantity: 1, line_total: 35, category: null }] }) };
            },
          };
        },
      };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    const out = await createGeminiReceiptParser({ apiKey: "k", retryDelayMs: 0 }).parse(
      { data: new Uint8Array([1]), mimeType: "image/jpeg" },
      { people: [], knownNames: [], categoryNames: [] },
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
        { people: [], knownNames: [], categoryNames: [] },
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(n).toBe(1);
    vi.doUnmock("@google/genai");
  });
});

describe("bills shared with people", () => {
  it("asks for owners as short keys, sends names and notes, and maps the keys back to person ids", async () => {
    vi.resetModules();
    const requests: { contents: { parts: { text?: string }[] }[]; config: { responseJsonSchema: unknown } }[] = [];
    vi.doMock("@google/genai", async (orig) => {
      const real = await orig<typeof import("@google/genai")>();
      return {
        ...real,
        GoogleGenAI: class {
          models = {
            generateContent: async (req: (typeof requests)[number]) => {
              requests.push(req);
              return {
                text: JSON.stringify({
                  kind: "receipt", fees: [], merchant: "7-Eleven", date: null, total_paid: 50,
                  lines: [
                    { raw_name: "นมเปรี้ยว", canonical_name: "นมเปรี้ยว", quantity: 1, line_total: 15, category: null, owners: ["p1"], confident: true },
                    { raw_name: "แชมพู", canonical_name: "แชมพู", quantity: 1, line_total: 35, category: null, owners: ["me", "p1", "p2"], confident: false },
                  ],
                }),
              };
            },
          };
        },
      };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    const out = await createGeminiReceiptParser({ apiKey: "k" }).parse(
      { data: new Uint8Array([1]), mimeType: "image/jpeg" },
      {
        people: [
          { id: "uuid-fan", name: "แฟน", note: "ชอบนมเปรี้ยว" },
          { id: "uuid-mom", name: "แม่", note: "" },
        ],
        meNote: "ไม่ดื่มกาแฟ",
        knownNames: [],
        categoryNames: [],
      },
    );
    expect(out.lines.map((l) => [l.canonicalName, l.owners, l.confident])).toEqual([
      ["นมเปรี้ยว", { me: false, people: ["uuid-fan"] }, true],
      ["แชมพู", { me: true, people: ["uuid-fan", "uuid-mom"] }, false],
    ]);
    const prompt = requests[0].contents[0].parts.map((p) => p.text ?? "").join("");
    expect(prompt).toContain('p1: name "แฟน", note "ชอบนมเปรี้ยว"');
    expect(prompt).toContain('me: the buyer, note "ไม่ดื่มกาแฟ"');
    expect(prompt).not.toContain("uuid-fan"); // ids never reach the model
    expect(JSON.stringify(requests[0].config.responseJsonSchema)).toContain('"p2"');
    vi.doUnmock("@google/genai");
  });

  it("a plain scan asks for no owners at all", async () => {
    vi.resetModules();
    let schema = "";
    vi.doMock("@google/genai", async (orig) => {
      const real = await orig<typeof import("@google/genai")>();
      return {
        ...real,
        GoogleGenAI: class {
          models = {
            generateContent: async (req: { config: { responseJsonSchema: unknown } }) => {
              schema = JSON.stringify(req.config.responseJsonSchema);
              return { text: JSON.stringify({ kind: "receipt", fees: [], merchant: null, date: null, total_paid: 35, lines: [{ raw_name: "ข้าวปั้น", canonical_name: "ข้าวปั้น", quantity: 1, line_total: 35, category: null }] }) };
            },
          };
        },
      };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    const out = await createGeminiReceiptParser({ apiKey: "k" }).parse(
      { data: new Uint8Array([1]), mimeType: "image/jpeg" },
      { people: [], knownNames: [], categoryNames: [] },
    );
    expect(schema).not.toContain("owners");
    expect(out.lines[0]).toMatchObject({ owners: { me: true, people: [] }, confident: true });
    vi.doUnmock("@google/genai");
  });
});

describe("kinds and fees", () => {
  async function parseWith(reply: unknown) {
    vi.resetModules();
    vi.doMock("@google/genai", async (orig) => {
      const real = await orig<typeof import("@google/genai")>();
      return { ...real, GoogleGenAI: class { models = { generateContent: async () => ({ text: JSON.stringify(reply) }) }; } };
    });
    const { createGeminiReceiptParser } = await import("./GeminiReceiptParser");
    try {
      return await createGeminiReceiptParser({ apiKey: "k", retryDelayMs: 0 }).parse(
        { data: new Uint8Array([1]), mimeType: "image/jpeg" },
        { people: [], knownNames: [], categoryNames: [] },
      );
    } finally {
      vi.doUnmock("@google/genai");
    }
  }
  const food = { raw_name: "ข้าวมันไก่", canonical_name: "ข้าวมันไก่", quantity: 1, line_total: 60, category: null };

  it("reads a delivery order: fees in satang, discount-like and zero fees dropped", async () => {
    const out = await parseWith({
      kind: "delivery", merchant: "ร้าน A", date: null, total_paid: 80, lines: [food],
      fees: [{ name: "ค่าส่ง", amount: 25 }, { name: "ส่วนลดค่าส่ง", amount: 10 }, { name: "ค่าบริการ", amount: 0 }],
    });
    expect(out.kind).toBe("delivery");
    expect(out.fees).toEqual([{ name: "ค่าส่ง", amount: 2500 }]);
  });

  it("reads a transfer slip as one line", async () => {
    const out = await parseWith({
      kind: "transfer_slip", merchant: "นาย ก", date: null, total_paid: 60, fees: [],
      lines: [{ ...food, raw_name: "โอนเงินให้ นาย ก", canonical_name: "โอนเงิน" }],
    });
    expect(out).toMatchObject({ kind: "transfer_slip", total: 6000, merchant: "นาย ก" });
    expect(out.lines).toHaveLength(1);
  });

  it("a picture that is not a purchase becomes INVALID_RECEIPT", async () => {
    await expect(parseWith({ kind: "unknown", merchant: null, date: null, total_paid: 0, lines: [], fees: [] })).rejects.toMatchObject({
      code: "INVALID_RECEIPT",
    });
  });

  it("reads a bank history page into transactions: dates normalised, empty or zero rows dropped", async () => {
    const out = await parseWith({
      kind: "history", merchant: null, date: null, total_paid: 0, lines: [], fees: [],
      transactions: [
        { date: "2569-09-28", description: "7-Eleven", amount: 55, direction: "out", category: "อาหาร" },
        { date: null, description: "เงินเดือน", amount: 30000, direction: "in", category: null },
        { date: "2026-09-27", description: "   ", amount: 10, direction: "out", category: null },
        { date: "2026-09-27", description: "ศูนย์", amount: 0, direction: "out", category: null },
      ],
    });
    expect(out.kind).toBe("history");
    expect(out.lines).toEqual([]);
    expect(out.transactions).toEqual([
      { date: "2026-09-28", description: "7-Eleven", amount: 5500, direction: "out", categoryName: "อาหาร" },
      { date: null, description: "เงินเดือน", amount: 3000000, direction: "in", categoryName: null },
    ]);
  });

  it("a history page with no readable rows becomes INVALID_RECEIPT", async () => {
    await expect(
      parseWith({ kind: "history", merchant: null, date: null, total_paid: 0, lines: [], fees: [], transactions: [] }),
    ).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
  });

  it("caps a runaway history at 60 rows", async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ date: "2026-09-28", description: `r${i}`, amount: 10, direction: "out", category: null }));
    const out = await parseWith({ kind: "history", merchant: null, date: null, total_paid: 0, lines: [], fees: [], transactions: many });
    expect(out.transactions).toHaveLength(60);
  });
});
