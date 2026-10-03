"use client";

import Link from "next/link";
import { useState } from "react";
import { personColor, personName } from "@/client/people";
import { useOutstanding } from "@/client/queries";
import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";
import { PersonDot } from "../People";
import { Sheet } from "../Sheet";
import { WidgetCard } from "./WidgetCard";

/** Who owes us what. Tap a person for the entries it comes from and to record a repayment. */
export function PeopleWidget({ data }: { data: DashboardDTO }) {
  const [open, setOpen] = useState<string | null>(null);
  const outstanding = useOutstanding();
  const owing = data.balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = owing.reduce((s, b) => s + b.balance, 0);
  const detail = outstanding.data?.find((o) => o.personId === open);

  return (
    <>
      <WidgetCard title="คนที่ติดเรา">
        {owing.length === 0 ? (
          <div className="flex items-center gap-3">
            <Icon name="favorite" size={32} fill className="text-partner" />
            <span className="font-bold text-4xl text-partner">฿0</span>
            <span className="ml-auto text-sm text-ink-3">{data.people.length ? "เคลียร์แล้ว" : "ยังไม่มีใครติด"}</span>
          </div>
        ) : (
          <>
            {owing.length > 1 && <p className="mb-1 text-sm text-ink-3">รวม ฿{formatBaht(total)}</p>}
            <ul className="divide-y divide-line">
              {owing.map((b) => (
                <li key={b.personId}>
                  <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => setOpen(b.personId)}>
                    <PersonDot people={data.people} id={b.personId} size={12} />
                    <span className="min-w-0 flex-1 truncate">{personName(data.people, b.personId)}</span>
                    <span className="font-bold text-2xl" style={{ color: personColor(data.people, b.personId) }}>฿{formatBaht(b.balance)}</span>
                    <Icon name="chevron_right" className="text-ink-3" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </WidgetCard>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={`${personName(data.people, open)} ติดจากรายการไหน`}>
        <p className="mb-2 text-xs text-ink-3">เงินที่จ่ายคืนจะหักรายการเก่าสุดก่อน</p>
        <ul className="divide-y divide-line">
          {detail?.items.map((i) => (
            <li key={i.entryId} className="flex items-center justify-between py-2">
              <span className="text-sm text-ink-2">{new Date(i.occurredAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
              <span className="text-partner">฿{formatBaht(i.outstanding)}</span>
            </li>
          ))}
        </ul>
        <Link href={`/repay?person=${open}`} onClick={() => setOpen(null)} className="btn3d mt-4 w-full">
          {personName(data.people, open)} จ่ายคืน
        </Link>
      </Sheet>
    </>
  );
}
