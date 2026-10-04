"use client";

import { useAiBudget } from "@/client/queries";

/**
 * "AI เหลือ 12 จาก 20 ครั้ง": the one allowance every AI feature draws from. Hidden when there is no limit.
 * `onDark` for the voice screen, which is dark in both themes.
 */
export function AiBudgetNote({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const { data } = useAiBudget();
  if (!data || data.limit === null || data.remaining === null) return null;
  const low = data.remaining <= 3;
  const tone = low ? (onDark ? "text-streak" : "text-expense") : onDark ? "text-white/55" : "text-ink-3";
  return (
    <p role="status" className={`text-xs ${tone} ${className}`}>
      {data.remaining === 0
        ? `ใช้ AI ครบ ${data.limit} ครั้งแล้ว รอให้ครบ 24 ชม. นับจากครั้งที่ใช้ หรือจดเอง`
        : `AI เหลือ ${data.remaining} จาก ${data.limit} ครั้ง (นับย้อนหลัง 24 ชม.)`}
    </p>
  );
}
