"use client";

import { useAiBudget } from "@/client/queries";

/** "AI เหลือ 12 จาก 20 ครั้ง": the one allowance every AI feature draws from. Hidden when there is no limit. */
export function AiBudgetNote({ className = "" }: { className?: string }) {
  const { data } = useAiBudget();
  if (!data || data.limit === null || data.remaining === null) return null;
  const low = data.remaining <= 3;
  return (
    <p role="status" className={`text-xs ${low ? "text-expense" : "text-ink-3"} ${className}`}>
      {data.remaining === 0
        ? `ใช้ AI ครบ ${data.limit} ครั้งแล้ว รอให้ครบ 24 ชม. นับจากครั้งที่ใช้ หรือจดเอง`
        : `AI เหลือ ${data.remaining} จาก ${data.limit} ครั้ง (นับย้อนหลัง 24 ชม.)`}
    </p>
  );
}
