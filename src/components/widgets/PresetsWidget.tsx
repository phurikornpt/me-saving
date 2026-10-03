"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import type { DashboardDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht } from "@/domain/money";
import { partnerShareFor } from "@/domain/split";
import { useFeedback } from "../Feedback";
import { Icon } from "../Icon";
import { Spinner } from "../Loading";
import { WidgetCard } from "./WidgetCard";

export function PresetsWidget({ data }: { data: DashboardDTO }) {
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();

  const tap = useMutation({
    mutationFn: (p: DashboardDTO["presets"][number]) =>
      api.recordEntry({
        kind: "expense",
        total: p.amount,
        categoryId: p.categoryId,
        note: p.label,
        source: "preset",
        split: p.partnerMode ? { kind: p.partnerMode } : undefined,
      }),
    onMutate: (p) =>
      applyOptimisticEntry(qc, {
        kind: "expense", total: p.amount, categoryId: p.categoryId, note: p.label, source: "preset",
        partnerShare: p.partnerMode ? partnerShareFor(p.amount, { kind: p.partnerMode }) : 0,
      }),
    onSuccess: (out) => {
      afterLog(out);
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (_e, p, rollback) => {
      rollback?.();
      fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ", action: { label: "ลองใหม่", run: () => tap.mutate(p) } });
    },
  });

  return (
    <WidgetCard title="ปุ่มลัด · แตะครั้งเดียวจด">
      {data.presets.length === 0 ? (
        <p className="text-sm text-ink-3">
          ยังไม่มีปุ่มลัด <Link href="/settings" className="underline">ตั้งที่การตั้งค่า</Link>
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {data.presets.map((p) => (
            <button
              key={p.id}
              disabled={tap.isPending}
              onClick={() => tap.mutate(p)}
              className="flex shrink-0 items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm shadow-[0_3px_0_var(--line)] active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              <Icon name={p.icon} size={20} />
              {p.label} <span className="text-ink-3">฿{formatBaht(p.amount)}</span>
              {p.partnerMode && <Icon name="group" size={16} className="text-partner" />}
              {tap.isPending && tap.variables?.id === p.id && <Spinner size={14} />}
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
