"use client";

import Link from "next/link";
import { useState } from "react";
import { useCalendar, useCategories, useEntriesOn } from "@/client/queries";
import type { EntryDTO } from "@/client/types";
import { addDays } from "@/domain/day";
import { formatBaht, formatCompact } from "@/domain/money";
import { EditEntrySheet } from "../EditEntrySheet";
import { EntryRow } from "../EntryRow";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { WidgetCard } from "./WidgetCard";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function CalendarWidget({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<EntryDTO | null>(null);
  const { data } = useCalendar(month);
  const { data: categories = [] } = useCategories();
  const dayEntries = useEntriesOn(openDay);

  const firstDow = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <>
      <WidgetCard
        title="ปฏิทิน"
        action={
          <div className="flex items-center gap-1">
            <button aria-label="เดือนก่อน" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-1">
              <Icon name="chevron_left" size={20} />
            </button>
            <span className="min-w-28 text-center text-sm">{title}</span>
            <button aria-label="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-1">
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`pad${i}`} />
          ))}
          {data?.days.map((d) => {
            const heat = data.maxSpent > 0 ? Math.round((d.spent / data.maxSpent) * 55) : 0;
            const future = d.day > today;
            return (
              <button
                key={d.day}
                onClick={() => setOpenDay(d.day)}
                className={`relative flex min-h-[3.6rem] flex-col items-center rounded-xl px-0.5 pt-1 text-[10px] leading-tight ${
                  d.day === today ? "ring-2 ring-ink" : ""
                } ${future ? "opacity-40" : ""}`}
                style={{ background: `color-mix(in srgb, var(--expense) ${heat}%, var(--surface))` }}
                aria-label={`${d.day} จ่าย ${formatBaht(d.spent)} รับ ${formatBaht(d.earned)}`}
              >
                <span className="flex items-center gap-0.5 text-xs text-ink">
                  {Number(d.day.slice(8))}
                  {d.logged === "entry" && <Icon name="local_fire_department" size={11} fill className="text-expense" />}
                  {d.logged === "no_spend" && <Icon name="bedtime" size={11} fill className="text-xp" />}
                </span>
                {d.spent > 0 && <span className="text-expense">-{formatCompact(d.spent)}</span>}
                {d.earned > 0 && <span className="text-income">+{formatCompact(d.earned)}</span>}
              </button>
            );
          })}
        </div>
        {data && (
          <p className="mt-3 text-center text-sm text-ink-2">
            จ่าย <span className="text-expense">฿{formatBaht(data.totals.spent)}</span> · รับ{" "}
            <span className="text-income">฿{formatBaht(data.totals.earned)}</span> · คงเหลือ ฿{formatBaht(Math.abs(data.totals.net))}
            {data.totals.net < 0 && " (ติดลบ)"}
          </p>
        )}
      </WidgetCard>

      <Sheet
        open={!!openDay}
        onOpenChange={(o) => !o && setOpenDay(null)}
        title={openDay ? new Date(`${openDay}T12:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" }) : ""}
      >
        {dayEntries.isLoading && <p className="py-4 text-center text-ink-3">กำลังโหลด…</p>}
        {dayEntries.data?.length === 0 && <p className="py-4 text-center text-ink-3">ไม่มีรายการ</p>}
        <ul className="divide-y divide-line">
          {dayEntries.data?.map((e) => (
            <li key={e.id}>
              <EntryRow entry={e} categories={categories} onClick={() => setEditing(e)} />
            </li>
          ))}
        </ul>
        {openDay && openDay < addDays(today, 1) && (
          <Link href={`/new?mode=expense&day=${openDay}`} className="btn3d key mt-4 w-full text-sm">
            <Icon name="add" size={18} /> {openDay === today ? "จดเพิ่มวันนี้" : "จดย้อนหลังวันนี้ (ไม่ต่อ streak)"}
          </Link>
        )}
      </Sheet>
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
