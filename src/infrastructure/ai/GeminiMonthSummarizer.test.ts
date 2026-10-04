import { describe, expect, it, vi } from "vitest";
import type { MonthFacts } from "@/application/ports";
import { buildPrompt } from "./GeminiMonthSummarizer";

const FACTS: MonthFacts = {
  month: "2026-10",
  daysCovered: 15,
  loggedDays: 12,
  noSpendDays: 2,
  spent: 150000,
  prevSpent: 125000,
  changePct: 20,
  categories: [{ name: "อาหาร", spent: 120000, prevSpent: 100000, changePct: 20, sharePct: 80 }],
};

describe("buildPrompt", () => {
  it("hands over the precomputed facts in baht and tells the model to use only them", () => {
    const p = buildPrompt(FACTS);
    expect(p).toContain("Use ONLY the numbers given");
    expect(p).toContain("is already computed");
    expect(p).toContain('"spent":"1,500 บาท"');
    expect(p).toContain('"change_percent":20');
    expect(p).toContain('"name":"อาหาร"');
  });
});

/** Mocks @google/genai the way GeminiReceiptParser.test.ts does; `generate` decides each call's outcome. */
async function summarizerWith(generate: (n: number, real: typeof import("@google/genai")) => Promise<{ text: string }>) {
  vi.resetModules();
  const calls: unknown[] = [];
  vi.doMock("@google/genai", async (orig) => {
    const real = await orig<typeof import("@google/genai")>();
    return {
      ...real,
      GoogleGenAI: class {
        models = {
          generateContent: async (req: unknown) => {
            calls.push(req);
            return generate(calls.length, real);
          },
        };
      },
    };
  });
  const { createGeminiMonthSummarizer } = await import("./GeminiMonthSummarizer");
  return { summarizer: createGeminiMonthSummarizer({ apiKey: "k", retryDelayMs: 0 }), calls };
}

describe("Gemini month summarizer", () => {
  it("sends only the facts prompt (text, no images) at low temperature and returns the summary", async () => {
    const { summarizer, calls } = await summarizerWith(async () => ({ text: JSON.stringify({ summary: " เดือนนี้ค่ากินขึ้น 20%\nส่วนใหญ่เป็นอาหาร " }) }));
    expect(await summarizer.summarize(FACTS)).toBe("เดือนนี้ค่ากินขึ้น 20%\nส่วนใหญ่เป็นอาหาร");
    const req = calls[0] as { contents: { parts: object[] }[]; config: { temperature: number; responseMimeType: string } };
    expect(req.contents).toHaveLength(1);
    expect(req.contents[0].parts).toHaveLength(1);
    expect(req.config).toMatchObject({ temperature: 0.2, responseMimeType: "application/json" });
    vi.doUnmock("@google/genai");
  });

  it("caps a long answer", async () => {
    const { summarizer } = await summarizerWith(async () => ({ text: JSON.stringify({ summary: "ก".repeat(2000) }) }));
    expect((await summarizer.summarize(FACTS)).length).toBe(400);
    vi.doUnmock("@google/genai");
  });

  it("retries once on 503, then succeeds", async () => {
    const { summarizer, calls } = await summarizerWith(async (n, real) => {
      if (n === 1) throw new real.ApiError({ message: "overloaded", status: 503 });
      return { text: JSON.stringify({ summary: "ok" }) };
    });
    expect(await summarizer.summarize(FACTS)).toBe("ok");
    expect(calls).toHaveLength(2);
    vi.doUnmock("@google/genai");
  });

  it("does not retry quota errors (429) and reports AI_UNAVAILABLE", async () => {
    const { summarizer, calls } = await summarizerWith(async (_n, real) => {
      throw new real.ApiError({ message: "quota", status: 429 });
    });
    await expect(summarizer.summarize(FACTS)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(calls).toHaveLength(1);
    vi.doUnmock("@google/genai");
  });

  it("an unreadable answer is AI_UNAVAILABLE", async () => {
    const { summarizer } = await summarizerWith(async () => ({ text: "not json" }));
    await expect(summarizer.summarize(FACTS)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    vi.doUnmock("@google/genai");
  });
});
