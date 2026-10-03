"use client";

import Link from "next/link";
import { useState } from "react";
import { useOutstanding } from "@/client/queries";
import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { WidgetCard } from "./WidgetCard";

export function PartnerWidget({ data }: { data: DashboardDTO }) {
  const [open, setOpen] = useState(false);
  const outstanding = useOutstanding();
  return (
    <>
      <WidgetCard title="ยอดแฟนติดเรา">
        <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(true)} disabled={data.partnerBalance === 0}>
          <Icon name="favorite" size={32} fill className="text-partner" />
          <span className="font-bold text-4xl text-partner">฿{formatBaht(data.partnerBalance)}</span>
          {data.partnerBalance === 0 && <span className="ml-auto text-sm text-ink-3">เคลียร์แล้ว</span>}
          {data.partnerBalance > 0 && <Icon name="chevron_right" className="ml-auto text-ink-3" />}
        </button>
      </WidgetCard>

      <Sheet open={open} onOpenChange={setOpen} title="ค้างจากรายการไหน">
        <p className="mb-2 text-xs text-ink-3">แฟนจ่ายคืนจะหักรายการเก่าสุดก่อน</p>
        <ul className="divide-y divide-line">
          {outstanding.data?.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-ink-2">{new Date(i.occurredAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
              <span className="text-partner">฿{formatBaht(i.outstanding)}</span>
            </li>
          ))}
        </ul>
        <Link href="/repay" onClick={() => setOpen(false)} className="btn3d mt-4 w-full">
          แฟนจ่ายคืน
        </Link>
      </Sheet>
    </>
  );
}
