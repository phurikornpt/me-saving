"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { ApiError } from "@/client/api";
import { DUR, staggerDelay } from "@/client/motion";
import { useMonthSummary } from "@/client/queries";
import { summaryLines } from "@/client/summaryLines";
import { AiBudgetNote } from "../AiBudgetNote";
import { AuroraCloud } from "../AuroraCloud";
import { Icon } from "../Icon";
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
      {asked && isFetching && (
        <div className="flex flex-col items-center py-1" role="status">
          <AuroraCloud mode="thinking" pulse={0} blur={5} className="-my-3 h-28 w-28" />
          <span className="text-xs text-ink-3">กำลังสรุป…</span>
        </div>
      )}
      {/* the text arrives whole from the server; showing it a line at a time is a reveal, not a stream */}
      {data && !isFetching && (
        <div className="leading-relaxed">
          {summaryLines(data.text).map((line, i) => (
            <motion.p
              key={line}
              className="mb-1.5 last:mb-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.slow, delay: staggerDelay(i, 0.2, 0.8) }}
            >
              {line}
            </motion.p>
          ))}
        </div>
      )}
      {asked && error && (
        <div className="flex flex-col items-center gap-3 py-2">
          <AuroraCloud mode="error" pulse={0} blur={5} className="-my-3 h-24 w-24" />
          <p className="text-center text-sm text-ink-2">{errorText(error)}</p>
          <button className="btn3d" onClick={() => setAsked(false)}>ปิด</button>
        </div>
      )}
    </WidgetCard>
  );
}
