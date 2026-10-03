import { readFileSync } from "node:fs";
import { createGeminiReceiptParser } from "../src/infrastructure/ai/GeminiReceiptParser";

// Dev helper: pnpm tsx --env-file=.env.local scripts/try-receipt.ts path/to/receipt.jpg
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: try-receipt.ts <image>");
  const parser = createGeminiReceiptParser({
    apiKey: process.env.GEMINI_API_KEY!,
    model: process.env.GEMINI_MODEL,
  });
  const started = Date.now();
  const out = await parser.parse(
    { data: readFileSync(path), mimeType: path.endsWith(".png") ? "image/png" : "image/jpeg" },
    { partnerNote: process.env.PARTNER_NOTE ?? "แฟนชอบนมเปรี้ยวกับขนมหวาน", knownNames: [], categoryNames: ["อาหาร", "ของใช้", "อื่นๆ"] },
  );
  console.log(`${Date.now() - started} ms`);
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
