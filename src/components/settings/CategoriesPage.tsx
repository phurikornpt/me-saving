"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/client/api";
import { ICON_CHOICES } from "@/client/icons";
import { useCategories } from "@/client/queries";
import { useFeedback } from "../Feedback";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { AddButton, emptyHint, IconPicker, inputClass, SettingsGroup, SettingsItem, SettingsPage } from "./ui";

/** Categories. Hidden (archived), never deleted: old entries keep their label. */
export function CategoriesPage() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data, isPending } = useCategories();
  const categories = data ?? [];
  const [adding, setAdding] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["categories"] });
  const hide = useMutation({
    mutationFn: api.archiveCategory,
    onSuccess: refresh,
    onError: () => fb.toast({ tone: "error", message: "ซ่อนไม่สำเร็จ" }),
  });

  const active = categories.filter((c) => !c.archived);
  const group = (kind: "expense" | "income", title: string) => {
    const rows = active.filter((c) => c.kind === kind);
    return (
      <SettingsGroup title={title} loading={isPending}>
        {rows.length === 0 && emptyHint("ยังไม่มีหมวด")}
        {rows.map((c) => (
          <SettingsItem
            key={c.id}
            icon={c.icon}
            title={c.name}
            trailing={
              <button aria-label={`ซ่อน ${c.name}`} className="rounded-full p-1 text-ink-3" onClick={() => hide.mutate(c.id)}>
                <Icon name="delete" size={20} />
              </button>
            }
          />
        ))}
      </SettingsGroup>
    );
  };

  return (
    <SettingsPage title="หมวดหมู่" action={<AddButton label="เพิ่ม" onClick={() => setAdding(true)} />}>
      {group("expense", "รายจ่าย")}
      {group("income", "รายรับ")}
      <p className="px-2 text-xs text-ink-3">หมวดที่ลบจะถูกซ่อน รายการเก่ายังเห็นชื่อหมวดเดิม</p>

      <Sheet open={adding} onOpenChange={setAdding} title="เพิ่มหมวด">
        {adding && (
          <CategoryForm
            onDone={() => {
              setAdding(false);
              refresh();
            }}
          />
        )}
      </Sheet>
    </SettingsPage>
  );
}

function CategoryForm({ onDone }: { onDone: () => void }) {
  const fb = useFeedback();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState<string>(ICON_CHOICES[0]);
  const add = useMutation({
    mutationFn: () => api.createCategory({ name: name.trim(), icon, kind }),
    onSuccess: onDone,
    onError: () => fb.toast({ tone: "error", message: "เพิ่มไม่สำเร็จ ตรวจชื่ออีกครั้ง" }),
  });
  return (
    <div className="flex flex-col gap-3 pb-2">
      <input className={inputClass} placeholder="ชื่อหมวดใหม่" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="ชื่อหมวด" />
      <div className="flex gap-2">
        <button className="pill text-sm" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>รายจ่าย</button>
        <button className="pill text-sm" aria-pressed={kind === "income"} onClick={() => setKind("income")}>รายรับ</button>
      </div>
      <IconPicker choices={ICON_CHOICES} value={icon} onChange={setIcon} />
      <button className="btn3d" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>เพิ่มหมวด</button>
    </div>
  );
}
