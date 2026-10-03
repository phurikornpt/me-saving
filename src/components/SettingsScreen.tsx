"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { ICON_CHOICES } from "@/client/icons";
import { useCategories, useDashboard, useSettings } from "@/client/queries";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-[24px] bg-card p-4">
    <h2 className="mb-3 text-sm text-ink-3">{title}</h2>
    {children}
  </section>
);
const input = "w-full rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink";

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ICON_CHOICES.map((n) => (
        <button key={n} type="button" aria-label={n} aria-pressed={value === n} onClick={() => onChange(n)} className="pill !p-2">
          <Icon name={n} size={20} />
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ logout }: { logout: () => Promise<void> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const settings = useSettings();
  const dash = useDashboard();
  const { data: categories = [] } = useCategories();

  // Local edit buffer for the note; `null` means "untouched, show the saved value"
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const note = noteDraft ?? settings.data?.partnerNote ?? "";

  const saveNote = useMutation({
    mutationFn: () => api.updateSettings({ partnerNote: note }),
    onSuccess: () => {
      setNoteDraft(null);
      void qc.invalidateQueries({ queryKey: ["settings"] });
      fb.toast({ message: "บันทึกโน้ตแล้ว" });
    },
  });

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [icon, setIcon] = useState<string>(ICON_CHOICES[0]);
  const [mode, setMode] = useState<"" | "split" | "partnerAll">("");
  const addPreset = useMutation({
    mutationFn: () => api.createPreset({ label: label.trim(), icon, amount: parseBaht(amount), categoryId: null, partnerMode: mode || null }),
    onSuccess: () => {
      setLabel("");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => fb.toast({ tone: "error", message: "เพิ่มไม่สำเร็จ ตรวจชื่อและจำนวนเงิน" }),
  });
  const removePreset = useMutation({
    mutationFn: api.deletePreset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<"expense" | "income">("expense");
  const [catIcon, setCatIcon] = useState<string>(ICON_CHOICES[0]);
  const addCat = useMutation({
    mutationFn: () => api.createCategory({ name: catName.trim(), icon: catIcon, kind: catKind }),
    onSuccess: () => {
      setCatName("");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
  const archive = useMutation({ mutationFn: api.archiveCategory, onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }) });

  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="safe-top flex items-center gap-2 pb-3">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">ตั้งค่า</h1>
      </header>

      <div className="flex flex-col gap-3">
        <Section title="โน้ตเกี่ยวกับแฟน (ให้ AI ช่วยเดาว่าของชิ้นไหนเป็นของใคร)">
          <textarea
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="เช่น ชอบนมเปรี้ยว กินขนมหวาน ไม่กินเผ็ด"
            className="w-full rounded-2xl border-2 border-line bg-card p-3 outline-none focus:border-ink"
          />
          <p className="mt-2 text-xs text-ink-3">
            ⚠︎ ข้อความนี้ถูกส่งให้ Google (Gemini) ทุกครั้งที่สแกนใบเสร็จ อย่าใส่ชื่อจริงหรือข้อมูลอ่อนไหว เช่น เรื่องสุขภาพ
          </p>
          <button className="btn3d mt-3 w-full" disabled={noteDraft === null || saveNote.isPending} onClick={() => saveNote.mutate()}>
            บันทึกโน้ต
          </button>
        </Section>

        <Section title="ปุ่มลัด">
          <ul className="mb-3 divide-y divide-line">
            {dash.data?.presets.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <Icon name={p.icon} size={22} />
                <span className="flex-1">{p.label} <span className="text-ink-3">฿{formatBaht(p.amount)}</span></span>
                {p.partnerMode && <Icon name="group" size={18} className="text-partner" />}
                <button aria-label={`ลบ ${p.label}`} className="rounded-full p-1 text-ink-3" onClick={() => removePreset.mutate(p.id)}>
                  <Icon name="delete" size={20} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input className={input} placeholder="ชื่อ เช่น BTS" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
              <input className={`${input} w-28`} inputMode="decimal" placeholder="บาท" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <IconPicker value={icon} onChange={setIcon} />
            <div className="flex gap-2">
              {(
                [["", "ของเรา"], ["split", "หารกับแฟน"], ["partnerAll", "ของแฟน"]] as const
              ).map(([k, t]) => (
                <button key={k} className="pill text-sm" aria-pressed={mode === k} onClick={() => setMode(k)}>{t}</button>
              ))}
            </div>
            <button className="btn3d" disabled={!label.trim() || !amount || addPreset.isPending} onClick={() => addPreset.mutate()}>เพิ่มปุ่มลัด</button>
          </div>
        </Section>

        <Section title="หมวดหมู่">
          <ul className="mb-3 divide-y divide-line">
            {categories.filter((c) => !c.archived).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Icon name={c.icon} size={22} className={c.kind === "income" ? "text-income" : ""} />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-ink-3">{c.kind === "income" ? "รายรับ" : "รายจ่าย"}</span>
                <button aria-label={`ซ่อน ${c.name}`} className="rounded-full p-1 text-ink-3" onClick={() => archive.mutate(c.id)}>
                  <Icon name="delete" size={20} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <input className={input} placeholder="ชื่อหมวดใหม่" value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={40} />
            <div className="flex gap-2">
              <button className="pill text-sm" aria-pressed={catKind === "expense"} onClick={() => setCatKind("expense")}>รายจ่าย</button>
              <button className="pill text-sm" aria-pressed={catKind === "income"} onClick={() => setCatKind("income")}>รายรับ</button>
            </div>
            <IconPicker value={catIcon} onChange={setCatIcon} />
            <button className="btn3d" disabled={!catName.trim() || addCat.isPending} onClick={() => addCat.mutate()}>เพิ่มหมวด</button>
          </div>
          <p className="mt-2 text-xs text-ink-3">หมวดที่ลบจะถูกซ่อน รายการเก่ายังเห็นชื่อหมวดเดิม</p>
        </Section>

        <button
          className="btn3d key mt-2"
          style={{ ["--fg" as string]: "var(--expense)" }}
          disabled={loggingOut}
          onClick={() => {
            setLoggingOut(true);
            qc.clear();
            try { window.localStorage.removeItem("me-budget-cache"); } catch { /* ignore */ }
            void logout();
          }}
        >
          <Icon name="logout" size={20} /> ออกจากระบบ
        </button>
      </div>
    </main>
  );
}
