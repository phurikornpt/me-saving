"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Reorder } from "motion/react";
import { useState } from "react";
import { api } from "@/client/api";
import type { LayoutItem } from "@/client/types";
import type { WidgetId } from "@/domain/dashboard-layout";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const NAMES: Record<WidgetId, string> = {
  streak: "Streak & Level",
  people: "คนที่ติดเรา",
  wallets: "กระเป๋าเงิน",
  presets: "ปุ่มลัด",
  today: "วันนี้",
  calendar: "ปฏิทิน",
  summary: "สรุปรายเดือนตามหมวด",
  recent: "รายการล่าสุด",
};

/** Toggle widgets on/off and drag to reorder. Saved to the server so every device matches. */
export function EditLayoutSheet({ open, layout, onOpenChange }: { open: boolean; layout: LayoutItem[]; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="แก้ dashboard">
      {open && <Editor layout={layout} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function Editor({ layout, onDone }: { layout: LayoutItem[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState(layout);
  const save = useMutation({
    mutationFn: () => api.updateSettings({ dashboardLayout: items }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
    },
  });
  return (
    <>
      <p className="mb-2 text-xs text-ink-3">ลากเพื่อเรียงลำดับ · แตะสวิตช์เพื่อเปิด/ปิด</p>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-2">
        {items.map((it) => (
          <Reorder.Item key={it.id} value={it} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3" style={{ touchAction: "none" }}>
            <Icon name="drag_indicator" className="text-ink-3" />
            <span className="flex-1">{NAMES[it.id]}</span>
            <button
              role="switch"
              aria-checked={it.enabled}
              aria-label={NAMES[it.id]}
              onClick={() => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, enabled: !x.enabled } : x)))}
              className={`relative h-7 w-12 rounded-full transition-colors ${it.enabled ? "bg-primary" : "bg-line"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${it.enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <button className="btn3d mt-5 w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        บันทึก
      </button>
    </>
  );
}
