"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import type { DashboardDTO } from "@/client/types";
import { activeWallets } from "@/client/wallets";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht } from "@/domain/money";
import { sharesFor, type SplitMode } from "@/domain/split";
import { useFeedback } from "../Feedback";
import { PresetChip } from "./PresetChip";
import { WidgetCard } from "./WidgetCard";

const splitOf = (p: DashboardDTO["presets"][number]): SplitMode | undefined =>
  p.personId && p.splitKind ? { kind: p.splitKind, people: [p.personId] } : undefined;

export function PresetsWidget({ data }: { data: DashboardDTO }) {
  // A preset whose wallet was archived since falls back to the default instead of failing.
  const walletOf = (p: DashboardDTO["presets"][number]) =>
    p.walletId && activeWallets(data.wallets ?? []).some((w) => w.id === p.walletId) ? p.walletId : undefined;
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const [failures, setFailures] = useState<Record<string, number>>({});

  const tap = useMutation({
    mutationFn: (p: DashboardDTO["presets"][number]) =>
      api.recordEntry({
        kind: "expense",
        total: p.amount,
        categoryId: p.categoryId,
        note: p.label,
        source: "preset",
        presetId: p.id,
        split: splitOf(p),
        walletId: walletOf(p),
      }),
    onMutate: (p) =>
      applyOptimisticEntry(qc, {
        kind: "expense", total: p.amount, categoryId: p.categoryId, note: p.label, source: "preset", walletId: walletOf(p),
        shares: sharesFor(p.amount, splitOf(p) ?? { kind: "none" }),
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
      setFailures((f) => ({ ...f, [p.id]: (f[p.id] ?? 0) + 1 }));
      fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ", action: { label: "ลองใหม่", run: () => tap.mutate(p) } });
    },
  });

  return (
    <WidgetCard title="ปุ่มลัด · แตะครั้งเดียวจด">
      {data.presets.length === 0 ? (
        <p className="text-sm text-ink-3">
          ยังไม่มีปุ่มลัด <Link href="/settings/presets" className="underline">ตั้งที่การตั้งค่า</Link>
        </p>
      ) : (
        // the top padding is room for the "+฿x" a tap floats up; the scroller would clip it otherwise
        <div className="-mx-1 -mt-8 flex gap-2 overflow-x-auto px-1 pb-1 pt-8">
          {data.presets.map((p) => (
            <PresetChip
              key={p.id}
              preset={p}
              people={data.people}
              disabled={tap.isPending && tap.variables?.id === p.id}
              failed={failures[p.id] ?? 0}
              onTap={() => tap.mutate(p)}
            />
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
