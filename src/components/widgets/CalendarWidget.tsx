"use client";

import { DUR, staggerDelay } from "@/client/motion";
import { FORWARD } from "@/client/nav";
import Link from "next/link";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readNoSpendLogged, subscribeNoSpendLogged } from "@/client/justLogged";
import { calendarQuery, entriesQuery, useCalendar, useCategories, useEntriesOn } from "@/client/queries";
import { matchesSpend, setSpendFilter, useSpendFilter } from "@/client/spendFilter";
import { useArrivedLate } from "@/client/useDelayedFlag";
import { inWallet, useWalletFilter } from "@/client/walletFilter";
import type { EntryDTO } from "@/client/types";
import { addDays } from "@/domain/day";
import { SPEND_FILTERS, type SpendFilter } from "@/domain/spend-filter";
import { formatBaht, formatCompact } from "@/domain/money";
import { EditEntrySheet } from "../EditEntrySheet";
import { EntryRow } from "../EntryRow";
import { Icon } from "../Icon";
import { Skeleton } from "../Loading";
import { Sheet } from "../Sheet";
import { WidgetCard } from "./WidgetCard";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const SPEND_LABEL: Record<SpendFilter, string> = { all: "ทั้งหมด", mine: "ของฉัน", fronted: "ออกก่อน" };
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function CalendarWidget({ today }: { today: string }) {
  const noSpendJustNow = useSyncExternalStore(subscribeNoSpendLogged, readNoSpendLogged, () => false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<EntryDTO | null>(null);
  const wallet = useWalletFilter();
  const [grid, animateGrid] = useAnimate<HTMLDivElement>();
  const spend = useSpendFilter();
  const { data, isPlaceholderData } = useCalendar(month, wallet, spend);
  const qc = useQueryClient();
  // What to play once the numbers for the new month/filter are really on screen (dir 0 = fade only).
  const [pending, setPending] = useState<{ dir: 1 | -1 | 0 } | null>(null);
  useEffect(() => {
    if (!pending || isPlaceholderData || !data || !grid.current) return;
    void animateGrid(grid.current, pending.dir ? { x: [pending.dir * 28, 0], opacity: [0.2, 1] } : { opacity: [0.25, 1] }, { duration: DUR.base + 0.05 });
    setPending(null);
  }, [pending, isPlaceholderData, data, animateGrid, grid]);
  // Warm the neighbouring months so a press usually finds its numbers ready.
  useEffect(() => {
    if (!data) return;
    for (const by of [-1, 1]) void qc.prefetchQuery(calendarQuery(shiftMonth(month, by), wallet, spend));
  }, [data, month, wallet, spend, qc]);
  const { data: categories = [] } = useCategories();
  const dayEntries = useEntriesOn(openDay);
  const rowsArrivedLate = useArrivedLate(dayEntries.isLoading);
  const shown = dayEntries.data?.filter((e) => inWallet(e, wallet) && matchesSpend(e, spend));

  const firstDow = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  // The month slides in from the side you pressed, but only once its numbers have arrived (see the effect above).
  const go = (dir: 1 | -1) => {
    setMonth(shiftMonth(month, dir));
    setPending({ dir });
  };
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <>
      <WidgetCard
        title="ปฏิทิน"
        action={
          <div className="flex items-center gap-1">
            <button aria-label="เดือนก่อน" onClick={() => go(-1)} className="rounded-full p-1">
              <Icon name="chevron_left" size={20} />
            </button>
            <span className="min-w-28 text-center text-sm">{title}</span>
            <button aria-label="เดือนถัดไป" onClick={() => go(1)} className="rounded-full p-1">
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
        }
      >
        <div className="mb-2 flex gap-2" role="group" aria-label="กรองรายจ่าย">
          {SPEND_FILTERS.map((s) => (
            <button key={s} className="pill text-sm" aria-pressed={spend === s} onClick={() => {
                if (s !== spend) setPending({ dir: 0 });
                setSpendFilter(s);
              }}>
              {SPEND_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        {/* old numbers dim while the new ones load, so they never pass for the new month's */}
        <div className={`transition-opacity duration-150 ${isPlaceholderData ? "opacity-50" : ""}`}>
        <div ref={grid} className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`pad${i}`} />
          ))}
          {data?.days.map((d) => {
            const heat = data.maxSpent > 0 ? Math.round((d.spent / data.maxSpent) * 55) : 0;
            const future = d.day > today;
            return (
              <button
                key={d.day}
                // start fetching the day as the finger lands, so the list is often ready by the time the sheet is open
                onPointerDown={() => void qc.prefetchQuery(entriesQuery(d.day))}
                onClick={() => setOpenDay(d.day)}
                className={`relative flex min-h-[3.6rem] flex-col items-center rounded-xl px-0.5 pt-1 text-[10px] leading-tight ${
                  d.day === today ? "ring-2 ring-ink" : ""
                } ${future ? "opacity-40" : ""} ${d.day === today && d.logged === "no_spend" && noSpendJustNow ? "dot-pop" : ""}`}
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
        </div>
        {data && spend !== "all" && (
          <p className="mt-3 text-center text-sm text-ink-2">
            {spend === "mine" ? "จ่ายคนเดียว" : "ออกก่อน"} <span className="text-expense">฿{formatBaht(data.totals.spent)}</span>
          </p>
        )}
        {data && spend === "all" && (
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
        {dayEntries.isLoading && (
          <div className="flex flex-col gap-3 py-3" aria-busy="true" aria-label="กำลังโหลด">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {shown?.length === 0 && <p className="py-4 text-center text-ink-3">ไม่มีรายการ</p>}
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {shown?.map((e, i) => (
              <motion.li
                key={e.id}
                layout="position"
                initial={rowsArrivedLate ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0, transition: { duration: DUR.base, delay: rowsArrivedLate ? staggerDelay(i) : 0 } }}
                className="overflow-hidden"
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: DUR.base }}
              >
                <EntryRow entry={e} categories={categories} onClick={() => setEditing(e)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {openDay && openDay < addDays(today, 1) && (
          <Link href={`/new?mode=expense&day=${openDay}`} transitionTypes={FORWARD} className="btn3d key mt-4 w-full text-sm">
            <Icon name="add" size={18} /> {openDay === today ? "จดเพิ่มวันนี้" : "จดย้อนหลังวันนี้ (ไม่ต่อ streak)"}
          </Link>
        )}
      </Sheet>
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
