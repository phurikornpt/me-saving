import { formatBaht } from "@/domain/money";
import type { OwedItemDTO, OwedLineDTO } from "./types";

const day = (iso: string | Date) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/** What an owed entry was: its name, else its category, else a plain word. */
export const owedTitle = (item: OwedItemDTO, categoryName: (id: string | null) => string | undefined) =>
  item.title ?? categoryName(item.categoryId) ?? "รายการ";

/** "นมเปรี้ยว x2 30" / "แชมพู (หาร 3) 10" */
export function describeOwedLine(l: OwedLineDTO): string {
  return `${l.name}${l.qty > 1 ? ` x${l.qty}` : ""}${l.parts > 1 ? ` (หาร ${l.parts})` : ""} ${formatBaht(l.amount)}`;
}

/**
 * Plain text to send someone (LINE, SMS ...) listing what they still owe, oldest first.
 * Partly repaid entries show what's left and what it was.
 */
export function formatDebtMessage(input: {
  name: string;
  balance: number;
  items: OwedItemDTO[];
  categoryName: (id: string | null) => string | undefined;
  now: Date;
}): string {
  const rows = input.items.flatMap((i) => {
    const partly = i.outstanding < i.amount ? ` (จาก ฿${formatBaht(i.amount)} จ่ายแล้วบางส่วน)` : "";
    const head = `• ${day(i.occurredAt)} ${owedTitle(i, input.categoryName)} ฿${formatBaht(i.outstanding)}${partly}`;
    return i.lines.length ? [head, `  ${i.lines.map(describeOwedLine).join(" · ")}`] : [head];
  });
  return [`สรุปยอดค้าง ${input.name} (ณ ${day(input.now)})`, ...rows, `รวมค้าง ฿${formatBaht(input.balance)}`].join("\n");
}
