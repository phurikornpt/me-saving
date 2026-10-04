"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/client/api";
import { useSettings } from "@/client/queries";
import { useFeedback } from "./Feedback";

const area = "w-full rounded-2xl border-2 border-line bg-card p-3 outline-none focus:border-ink";

/** The buyer's own habits: on a shared receipt scan the AI weighs them against each person's note. */
export function MeNoteField() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data } = useSettings();
  const [draft, setDraft] = useState<string | null>(null); // null = untouched, show what's saved
  const saved = data?.meNote ?? "";
  const value = draft ?? saved;

  const save = useMutation({
    mutationFn: () => api.updateSettings({ meNote: value.trim() }),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      setDraft(null);
      fb.toast({ message: "บันทึกพฤติกรรมของเราแล้ว" });
    },
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ" }),
  });

  return (
    <div className="flex flex-col gap-2 py-4">
      <label htmlFor="me-note" className="text-sm">พฤติกรรมของเรา</label>
      <textarea
        id="me-note"
        className={area}
        rows={2}
        maxLength={500}
        placeholder="เช่น ไม่ดื่มกาแฟ ชอบขนมเค็ม ซื้อของใช้ในบ้านเอง"
        value={value}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p className="text-xs text-ink-3">ใช้ตอนสแกนใบเสร็จที่หารกับคนอื่น ช่วยให้ AI เดาว่าของชิ้นไหนเป็นของเรา</p>
      {draft !== null && draft.trim() !== saved && (
        <button className="btn3d" disabled={save.isPending} onClick={() => save.mutate()}>บันทึก</button>
      )}
    </div>
  );
}
