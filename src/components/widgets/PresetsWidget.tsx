"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { isBackdated, occurredAtOf, whenLabel, type WhenChoice } from "@/client/presetChoices";
import { presetPricesKey } from "@/client/queries";
import type { DashboardDTO } from "@/client/types";
import { activeWallets } from "@/client/wallets";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht } from "@/domain/money";
import { sharesFor, type SplitMode } from "@/domain/split";
import { useFeedback } from "../Feedback";
import { PresetChip } from "./PresetChip";
import { PresetPopover, type DragTarget } from "./PresetPopover";
import { WidgetCard } from "./WidgetCard";

type Preset = DashboardDTO["presets"][number];
/** One log from a preset: a tap (its own price, now) or a pick from its hold popup. */
type Log = { preset: Preset; amount: number; when: WhenChoice };

const splitOf = (p: Preset): SplitMode | undefined =>
  p.personId && p.splitKind ? { kind: p.splitKind, people: [p.personId] } : undefined;

export function PresetsWidget({ data }: { data: DashboardDTO }) {
  // A preset whose wallet was archived since falls back to the default instead of failing.
  const walletOf = (p: DashboardDTO["presets"][number]) =>
    p.walletId && activeWallets(data.wallets ?? []).some((w) => w.id === p.walletId) ? p.walletId : undefined;
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [held, setHeld] = useState<{ preset: Preset; chip: DOMRect } | null>(null);
  const drag = useRef<DragTarget | null>(null);

  const log = useMutation({
    mutationFn: ({ preset: p, amount, when }: Log) =>
      api.recordEntry({
        kind: "expense",
        total: amount,
        occurredAt: occurredAtOf(when),
        categoryId: p.categoryId,
        note: p.label,
        source: "preset",
        presetId: p.id,
        split: splitOf(p),
        walletId: walletOf(p),
      }),
    onMutate: ({ preset: p, amount, when }) =>
      isBackdated(when, new Date())
        ? undefined // a day before today doesn't belong in today's numbers
        : applyOptimisticEntry(qc, {
            kind: "expense", total: amount, categoryId: p.categoryId, note: p.label, source: "preset", walletId: walletOf(p),
            shares: sharesFor(amount, splitOf(p) ?? { kind: "none" }),
          }),
    onSuccess: (out, { preset: p, when }) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: presetPricesKey(p.id) });
      const at = when.kind === "now" ? "" : ` · ${whenLabel(when, new Date())}${isBackdated(when, new Date()) ? " (ไม่ต่อ streak)" : ""}`;
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}${at}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (_e, v, rollback) => {
      rollback?.();
      setFailures((f) => ({ ...f, [v.preset.id]: (f[v.preset.id] ?? 0) + 1 }));
      fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ", action: { label: "ลองใหม่", run: () => log.mutate(v) } });
    },
  });

  return (
    <WidgetCard title="ปุ่มลัด · แตะจด กดค้างเลือกราคา">
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
              disabled={log.isPending && log.variables?.preset.id === p.id}
              failed={failures[p.id] ?? 0}
              onTap={() => log.mutate({ preset: p, amount: p.amount, when: { kind: "now" } })}
              onDown={() => void qc.prefetchQuery({ queryKey: presetPricesKey(p.id), queryFn: () => api.presetPrices(p.id), staleTime: 60_000 })}
              onHold={(chip) => setHeld({ preset: p, chip })}
              onDrag={(x, y) => drag.current?.move(x, y)}
              onDrop={(x, y) => drag.current?.drop(x, y)}
            />
          ))}
        </div>
      )}
      {held && (
        <PresetPopover
          preset={held.preset}
          anchor={held.chip}
          dragRef={drag}
          onClose={() => setHeld(null)}
          onLog={(amount, when) => {
            setHeld(null);
            log.mutate({ preset: held.preset, amount, when });
          }}
        />
      )}
    </WidgetCard>
  );
}
