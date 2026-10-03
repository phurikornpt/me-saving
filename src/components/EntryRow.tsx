import { isPendingEntry } from "@/client/optimistic";
import type { CategoryDTO, EntryDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";

/** One entry. Expenses show only OUR share big; the partner's part is a small hint. */
export function EntryRow({ entry, categories, onClick }: { entry: EntryDTO; categories: CategoryDTO[]; onClick?: () => void }) {
  const cat = categories.find((c) => c.id === entry.categoryId);
  const isRepay = entry.kind === "repayment";
  const mine = entry.total - entry.partnerShare;
  const icon = isRepay
    ? "currency_exchange"
    : entry.source === "receipt" ? "receipt_long" : entry.source === "itemized" ? "list_alt" : (cat?.icon ?? "more_horiz");
  const label = isRepay
    ? "แฟนจ่ายคืน"
    : (entry.merchant ?? entry.note ?? cat?.name ?? (entry.source === "itemized" ? "หลายรายการ" : "รายการ"));
  const color = entry.kind === "income" ? "text-income" : isRepay ? "text-partner" : "text-expense";
  const pending = isPendingEntry(entry);
  const sign = entry.kind === "expense" ? "-" : "+";

  return (
    <button onClick={onClick} disabled={!onClick} className={`flex w-full items-center gap-3 py-2 text-left ${pending ? "opacity-60" : ""}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {entry.partnerShare > 0 && <span className="block text-xs text-partner">แฟนติด ฿{formatBaht(entry.partnerShare)}</span>}
      </span>
      {pending && <Spinner size={14} className="text-ink-3" />}
      <span className={`font-medium ${color}`}>
        {sign}฿{formatBaht(entry.kind === "expense" ? mine : entry.total)}
      </span>
    </button>
  );
}
