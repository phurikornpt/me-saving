"use client";

import Link from "next/link";
import type { DashboardDTO } from "@/client/types";
import { activeWallets } from "@/client/wallets";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";
import { WidgetCard } from "./WidgetCard";

const baht = (satang: number) => `${satang < 0 ? "-" : ""}฿${formatBaht(Math.abs(satang))}`;

/** How much is in each wallet now, and the total. Moving money between them starts here. */
export function WalletsWidget({ data }: { data: DashboardDTO }) {
  const wallets = activeWallets(data.wallets ?? []);
  const total = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <WidgetCard
      title="กระเป๋าเงิน"
      action={
        wallets.length > 1 ? (
          <Link href="/transfer" className="pill flex items-center gap-1 !py-1 text-sm">
            <Icon name="swap_horiz" size={18} /> โอน
          </Link>
        ) : (
          <Link href="/settings/wallets" className="text-sm text-ink-3 underline">เพิ่มกระเป๋า</Link>
        )
      }
    >
      {wallets.length > 1 && <p className="mb-1 text-sm text-ink-3">รวม {baht(total)}</p>}
      <ul className="divide-y divide-line">
        {wallets.map((w) => (
          <li key={w.id} className="flex items-center gap-3 py-2">
            <Icon name={w.icon} size={22} />
            <span className="min-w-0 flex-1 truncate">
              {w.name}
              {w.isDefault && wallets.length > 1 && <span className="ml-1 text-xs text-ink-3">· หลัก</span>}
            </span>
            <span className={`font-bold text-xl ${w.balance < 0 ? "text-expense" : ""}`}>{baht(w.balance)}</span>
          </li>
        ))}
      </ul>
      {wallets.length === 1 && wallets[0].openingBalance === 0 && (
        <p className="mt-1 text-xs text-ink-3">
          ยอดนับจากรายการที่จดไว้ <Link href="/settings/wallets" className="underline">ตั้งยอดเงินจริง</Link>
        </p>
      )}
    </WidgetCard>
  );
}
