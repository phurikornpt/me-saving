"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { breakdownQuery, useCategoryBreakdown } from "@/client/queries";
import { useWalletFilter } from "@/client/walletFilter";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";
import { Skeleton } from "../Loading";
import { WidgetCard } from "./WidgetCard";

const MAX_SLICES = 5; // matches --series-1..5; the tail folds into "อื่นๆ"
const OTHER = "other";
const R = 44;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2; // surface-coloured gap between slices

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

interface Row { key: string; name: string; icon: string; spent: number; color: string }

export function CategorySummaryWidget({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const wallet = useWalletFilter();
  const { data, isPlaceholderData } = useCategoryBreakdown(month, wallet);
  const qc = useQueryClient();
  useEffect(() => {
    if (!data) return;
    for (const by of [-1, 1]) void qc.prefetchQuery(breakdownQuery(shiftMonth(month, by), wallet));
  }, [data, month, wallet, qc]);
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  const rows: Row[] = [];
  if (data) {
    data.slices.slice(0, MAX_SLICES).forEach((s, i) =>
      rows.push({ key: s.categoryId ?? "none", name: s.name, icon: s.icon, spent: s.spent, color: `var(--series-${i + 1})` }),
    );
    const rest = data.slices.slice(MAX_SLICES);
    if (rest.length) rows.push({ key: OTHER, name: "อื่นๆ", icon: "more_horiz", spent: rest.reduce((s, x) => s + x.spent, 0), color: "var(--series-other)" });
  }
  const total = data?.total ?? 0;
  const active = rows.find((r) => r.key === picked) ?? null;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  let offset = 0;
  const arcs = rows.map((r) => {
    const len = Math.max((r.spent / total) * CIRCUMFERENCE - (rows.length > 1 ? GAP : 0), 0.5);
    const arc = { r, len, offset };
    offset += (r.spent / total) * CIRCUMFERENCE;
    return arc;
  });

  return (
    <WidgetCard
      title="สรุปรายเดือนตามหมวด"
      action={
        <div className="flex items-center gap-1">
          <button aria-label="เดือนก่อน" onClick={() => { setMonth(shiftMonth(month, -1)); setPicked(null); }} className="rounded-full p-1">
            <Icon name="chevron_left" size={20} />
          </button>
          <span className="min-w-28 text-center text-sm">{title}</span>
          <button aria-label="เดือนถัดไป" onClick={() => { setMonth(shiftMonth(month, 1)); setPicked(null); }} className="rounded-full p-1">
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      }
    >
      {!data && <div className="flex justify-center py-2"><Skeleton className="h-36 w-36 !rounded-full" /></div>}
      {/* the previous month's chart stays until the new one arrives, dimmed so it is not mistaken for it */}
      <div className={`transition-opacity duration-200 ${isPlaceholderData ? "pointer-events-none opacity-50" : ""}`} aria-busy={isPlaceholderData}>
      {data && total === 0 && <p className="py-6 text-center text-sm text-ink-3">ยังไม่มีรายจ่ายในเดือนนี้</p>}
      {data && total > 0 && (
        <>
          <div className="relative mx-auto h-40 w-40">
            <svg
              viewBox="0 0 120 120"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`รายจ่ายของเรา ฿${formatBaht(total)} ${rows.map((r) => `${r.name} ${pct(r.spent)}%`).join(" ")}`}
            >
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface)" strokeWidth="14" />
              {arcs.map(({ r, len, offset: o }) => (
                <circle
                  key={r.key}
                  cx="60" cy="60" r={R} fill="none" stroke={r.color}
                  strokeWidth={picked === r.key ? 18 : 14}
                  strokeDasharray={`${len} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-o}
                  opacity={picked && picked !== r.key ? 0.35 : 1}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-150"
                  onClick={() => setPicked(picked === r.key ? null : r.key)}
                  onMouseEnter={() => setPicked(r.key)}
                  onMouseLeave={() => setPicked(null)}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="max-w-24 truncate text-xs text-ink-3">{active ? active.name : "ใช้ไปทั้งหมด"}</span>
              <span className="font-bold text-xl">฿{formatBaht(active ? active.spent : total)}</span>
              {active && <span className="text-xs text-ink-2">{pct(active.spent)}%</span>}
            </div>
          </div>

          <ul className="mt-3 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  className={`flex w-full items-center gap-3 py-2 text-left ${picked && picked !== r.key ? "opacity-50" : ""}`}
                  onClick={() => setPicked(picked === r.key ? null : r.key)}
                  aria-pressed={picked === r.key}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                  <Icon name={r.icon} size={20} className="text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="text-sm text-ink-3">{pct(r.spent)}%</span>
                  <span className="min-w-16 text-right font-medium">฿{formatBaht(r.spent)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </WidgetCard>
  );
}
