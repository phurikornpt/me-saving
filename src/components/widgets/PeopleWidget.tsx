"use client";

import Link from "next/link";
import { useState } from "react";
import { personColor, personName } from "@/client/people";
import { FORWARD } from "@/client/nav";
import { owedTitle, describeOwedLine, formatDebtMessage } from "@/client/debtMessage";
import { useCategories, useOutstanding } from "@/client/queries";
import type { DashboardDTO, OwedItemDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { AnimatedNumber } from "../AnimatedNumber";
import { useFeedback } from "../Feedback";
import { Icon } from "../Icon";
import { PersonDot } from "../People";
import { Sheet } from "../Sheet";
import { WidgetCard } from "./WidgetCard";

const baht = (satang: number) => `฿${formatBaht(satang)}`;

/** Who owes us what. Tap a person for the entries it comes from and to record a repayment. */
export function PeopleWidget({ data }: { data: DashboardDTO }) {
  const [open, setOpen] = useState<string | null>(null);
  const outstanding = useOutstanding();
  const owing = data.balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = owing.reduce((s, b) => s + b.balance, 0);
  const detail = outstanding.data?.find((o) => o.personId === open);
  const { data: categories = [] } = useCategories();
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name;
  const fb = useFeedback();

  // The phone's share sheet (LINE, Messages ...); where there is none, copy the text instead.
  const share = async () => {
    if (!detail) return;
    const text = formatDebtMessage({ name: personName(data.people, open), balance: detail.balance, items: detail.items, categoryName, now: new Date() });
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // closed the sheet: not an error
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      fb.toast({ message: "คัดลอกรายการแล้ว วางในแชทได้เลย" });
    } catch {
      fb.toast({ tone: "error", message: "แชร์ไม่สำเร็จ" });
    }
  };

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
            {owing.length > 1 && <p className="mb-1 text-sm text-ink-3">รวม <AnimatedNumber value={total} format={baht} /></p>}
            <ul className="divide-y divide-line">
              {owing.map((b) => (
                <li key={b.personId}>
                  <button className="press flex w-full items-center gap-3 py-2 text-left" onClick={() => setOpen(b.personId)}>
                    <PersonDot people={data.people} id={b.personId} size={12} />
                    <span className="min-w-0 flex-1 truncate">{personName(data.people, b.personId)}</span>
                    <span className="font-bold text-2xl" style={{ color: personColor(data.people, b.personId) }}><AnimatedNumber value={b.balance} format={baht} /></span>
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
            <OwedRow key={i.entryId} item={i} title={owedTitle(i, categoryName)} />
          ))}
        </ul>
        {detail && (
          <button className="btn3d key mt-4 flex w-full items-center justify-center gap-2" onClick={() => void share()}>
            <Icon name="ios_share" size={20} />
            ส่งรายการให้ {personName(data.people, open)}
          </button>
        )}
        <Link href={`/repay?person=${open}`} transitionTypes={FORWARD} onClick={() => setOpen(null)} className="btn3d mt-3 w-full">
          {personName(data.people, open)} จ่ายคืน
        </Link>
      </Sheet>
    </>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** One owed entry: date, what it was, what's left. A group opens to show the lines this person shares. */
function OwedRow({ item, title }: { item: OwedItemDTO; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = item.lines.length > 0;
  return (
    <li className="py-2">
      <button
        className="flex w-full items-center gap-2 text-left"
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        onClick={() => setExpanded((x) => !x)}
      >
        <span className="w-12 shrink-0 text-sm text-ink-3">{day(item.occurredAt)}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="text-right">
          <span className="text-partner">฿{formatBaht(item.outstanding)}</span>
          {item.outstanding < item.amount && <span className="block text-xs text-ink-3 line-through">฿{formatBaht(item.amount)}</span>}
        </span>
        {canExpand && <Icon name={expanded ? "expand_less" : "expand_more"} size={20} className="text-ink-3" />}
      </button>
      {expanded && (
        <ul className="mt-1 pl-14 text-sm text-ink-2">
          {item.lines.map((l, i) => (
            <li key={i}>{describeOwedLine(l)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
