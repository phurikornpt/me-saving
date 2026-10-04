import { isPendingEntry } from "@/client/optimistic";
import { personName } from "@/client/people";
import { usePeople, useWallets } from "@/client/queries";
import { walletName } from "@/client/wallets";
import type { CategoryDTO, EntryDTO, WalletDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";

/** One entry. Expenses show only OUR share big; what others owe is a small hint. */
export function EntryRow({ entry, categories, onClick }: { entry: EntryDTO; categories: CategoryDTO[]; onClick?: () => void }) {
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  if (entry.kind === "transfer") return <TransferRow entry={entry} onClick={onClick} wallets={wallets} />;
  const cat = categories.find((c) => c.id === entry.categoryId);
  const isRepay = entry.kind === "repayment";
  // Only worth saying which wallet once there is more than one
  const wallet = wallets.length > 1 ? walletName(wallets, entry.walletId) : null;
  const mine = entry.total - entry.othersShare;
  const owedBy =
    entry.shares.length === 1 ? `${personName(people, entry.shares[0].personId)} ติด` : `${entry.shares.length} คนติด`;
  const icon = isRepay
    ? "currency_exchange"
    : entry.source === "receipt" ? "receipt_long" : entry.source === "itemized" ? "list_alt" : (cat?.icon ?? "more_horiz");
  const label = isRepay
    ? `${personName(people, entry.personId)} จ่ายคืน`
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
        {entry.othersShare > 0 && <span className="block text-xs text-partner">{owedBy} ฿{formatBaht(entry.othersShare)}</span>}
        {wallet && <span className="block text-xs text-ink-3">{wallet}</span>}
      </span>
      {pending && <Spinner size={14} className="text-ink-3" />}
      <span className={`font-medium ${color}`}>
        {sign}฿{formatBaht(entry.kind === "expense" ? mine : entry.total)}
      </span>
    </button>
  );
}

/** Money moved between our own wallets: neither spending nor income, so it has no sign or colour. */
function TransferRow({ entry, wallets, onClick }: { entry: EntryDTO; wallets: WalletDTO[]; onClick?: () => void }) {
  const pending = isPendingEntry(entry);
  return (
    <button onClick={onClick} disabled={!onClick} className={`flex w-full items-center gap-3 py-2 text-left ${pending ? "opacity-60" : ""}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
        <Icon name="swap_horiz" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {walletName(wallets, entry.walletId)} → {walletName(wallets, entry.toWalletId)}
        </span>
        <span className="block truncate text-xs text-ink-3">{entry.note ?? "โอนระหว่างกระเป๋า"}</span>
      </span>
      {pending && <Spinner size={14} className="text-ink-3" />}
      <span className="font-medium text-ink-2">฿{formatBaht(entry.total)}</span>
    </button>
  );
}
