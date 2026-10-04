import { describe, expect, it } from "vitest";
import { formatDebtMessage } from "./debtMessage";
import type { OwedItemDTO } from "./types";

const item = (p: Partial<OwedItemDTO>): OwedItemDTO => ({
  entryId: "e", occurredAt: "2026-10-01T05:00:00Z", amount: 6000, outstanding: 6000,
  title: null, categoryId: null, source: "manual", lines: [], ...p,
});

describe("formatDebtMessage", () => {
  it("lists each entry oldest first with its lines, partly repaid ones, and the total", () => {
    const text = formatDebtMessage({
      name: "แฟน",
      balance: 10500,
      now: new Date("2026-10-04T05:00:00Z"),
      categoryName: (id) => (id === "c-travel" ? "เดินทาง" : undefined),
      items: [
        item({ amount: 6000, outstanding: 2000, categoryId: "c-travel" }),
        item({
          occurredAt: "2026-10-03T05:00:00Z", amount: 8500, outstanding: 8500, title: "7-Eleven", source: "receipt",
          lines: [
            { name: "นมเปรี้ยว", qty: 2, amount: 3000, parts: 1 },
            { name: "แชมพู", qty: 1, amount: 5500, parts: 3 },
          ],
        }),
      ],
    });
    expect(text).toBe(
      [
        "สรุปยอดค้าง แฟน (ณ 4 ต.ค.)",
        "• 1 ต.ค. เดินทาง ฿20 (จาก ฿60 จ่ายแล้วบางส่วน)",
        "• 3 ต.ค. 7-Eleven ฿85",
        "  นมเปรี้ยว x2 30 · แชมพู (หาร 3) 55",
        "รวมค้าง ฿105",
      ].join("\n"),
    );
  });

  it("falls back to a plain word when neither a name nor a category says what it was", () => {
    const text = formatDebtMessage({ name: "A", balance: 6000, now: new Date("2026-10-04T05:00:00Z"), categoryName: () => undefined, items: [item({})] });
    expect(text).toContain("• 1 ต.ค. รายการ ฿60");
  });
});
