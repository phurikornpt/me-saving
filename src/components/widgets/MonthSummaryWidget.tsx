"use client";

import { useState } from "react";
import { ApiError } from "@/client/api";
import { useMonthSummary } from "@/client/queries";
import { AiBudgetNote } from "../AiBudgetNote";
import { Icon } from "../Icon";
import { Skeleton } from "../Loading";
import { WidgetCard } from "./WidgetCard";

const errorText = (e: unknown) =>
  e instanceof ApiError && e.code === "RATE_LIMITED"
    ? "วันนี้ใช้ AI ครบโควตาแล้ว พรุ่งนี้ลองใหม่นะ"
    : "AI พักอยู่ตอนนี้ ลองใหม่อีกครั้งภายหลังนะ";

/**
 * AI summary of this month. Nothing is fetched until the button is pressed, so opening the dashboard never
 * spends AI quota; the server caches the text, so pressing again later the same day costs nothing.
 */
export function MonthSummaryWidget({ today }: { today: string }) {
  const month = today.slice(0, 7);
  const [asked, setAsked] = useState(false);
  const { data, error, isFetching } = useMonthSummary(month, asked);

  return (
    <WidgetCard title="สรุปเดือนนี้">
      {!asked && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-center text-sm text-ink-3">ให้ AI สรุปรายจ่ายเดือนนี้สั้นๆ จากยอดรวมแต่ละหมวด</p>
          <button className="btn3d key flex items-center gap-2" onClick={() => setAsked(true)}>
            <Icon name="auto_awesome" size={20} />
            สรุปให้หน่อย
          </button>
          <AiBudgetNote />
        </div>
      )}
      {asked && isFetching && !data && <Skeleton className="h-16 w-full" />}
      {data && <p className="whitespace-pre-line leading-relaxed">{data.text}</p>}
      {asked && error && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-center text-sm text-ink-2">{errorText(error)}</p>
          <button className="btn3d" onClick={() => setAsked(false)}>ปิด</button>
        </div>
      )}
    </WidgetCard>
  );
}
