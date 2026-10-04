"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/client/api";
import { usePeople } from "@/client/queries";
import type { PersonDTO } from "@/client/types";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { PersonDot } from "./People";

const input = "w-full rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink";
const area = "w-full rounded-2xl border-2 border-line bg-card p-3 outline-none focus:border-ink";

/** Set up the people we front money for: a name, and a note that helps the AI guess what's theirs. */
export function PeopleSettings() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data: people = [] } = usePeople();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const add = useMutation({
    mutationFn: () => api.createPerson({ name: name.trim(), note }),
    onSuccess: () => {
      setName("");
      setNote("");
      refresh();
    },
    onError: () => fb.toast({ tone: "error", message: "เพิ่มไม่สำเร็จ ตรวจชื่ออีกครั้ง" }),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updatePerson>[1] }) => api.updatePerson(v.id, v.patch),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ" }),
  });

  const active = people.filter((p) => !p.archived);
  const hidden = people.filter((p) => p.archived);

  return (
    <>
      <ul className="mb-3 divide-y divide-line">
        {active.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="py-2">
              <PersonForm person={p} people={people} busy={update.isPending} onCancel={() => setEditing(null)}
                onSave={(patch) => update.mutate({ id: p.id, patch })}
                onHide={() => update.mutate({ id: p.id, patch: { archived: true } })} />
            </li>
          ) : (
            <li key={p.id}>
              <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => setEditing(p.id)}>
                <PersonDot people={people} id={p.id} size={12} />
                <span className="min-w-0 flex-1">
                  <span className="block">{p.name}</span>
                  {p.note && <span className="block truncate text-xs text-ink-3">{p.note}</span>}
                </span>
                <Icon name="edit" size={18} className="text-ink-3" />
              </button>
            </li>
          ),
        )}
      </ul>

      <div className="flex flex-col gap-2">
        <input className={input} placeholder="ชื่อ เช่น แฟน, แม่, A" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <textarea className={area} rows={2} maxLength={500} placeholder="พฤติกรรม (ไม่ใส่ก็ได้) เช่น ชอบนมเปรี้ยว กินขนมหวาน ไม่กินเผ็ด" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn3d" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
          <Icon name="person_add" size={20} /> เพิ่มคน
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        ⚠︎ ชื่อและโน้ตของคนที่เลือกตอน &quot;สแกนหารกัน&quot; รวมถึงพฤติกรรมของเรา ถูกส่งให้ Google (Gemini) เพื่อเดาว่าของชิ้นไหนเป็นของใคร
        ใช้ชื่อเล่นหรือความสัมพันธ์ (เช่น แฟน, แม่) และอย่าใส่ข้อมูลอ่อนไหว เช่น เรื่องสุขภาพ
      </p>

      {hidden.length > 0 && (
        <div className="mt-3">
          <button className="text-xs text-ink-3 underline" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "ซ่อน" : `ดูคนที่ซ่อนไว้ (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="mt-1 divide-y divide-line">
              {hidden.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-ink-3">
                  <span className="flex-1">{p.name}</span>
                  <button className="pill text-xs" onClick={() => update.mutate({ id: p.id, patch: { archived: false } })}>แสดงอีกครั้ง</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function PersonForm({
  person, people, busy, onSave, onCancel, onHide,
}: {
  person: PersonDTO; people: PersonDTO[]; busy: boolean;
  onSave: (patch: { name: string; note: string }) => void; onCancel: () => void; onHide: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [note, setNote] = useState(person.note);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <PersonDot people={people} id={person.id} size={12} />
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="ชื่อ" />
      </div>
      <textarea className={area} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="พฤติกรรม เช่น ชอบนมเปรี้ยว ไม่กินเผ็ด" aria-label="พฤติกรรม" />
      <div className="flex gap-2">
        <button className="btn3d key flex-1" style={{ ["--fg" as string]: "var(--expense)" }} disabled={busy} onClick={onHide}>
          ซ่อน
        </button>
        <button className="btn3d key flex-1" onClick={onCancel}>ยกเลิก</button>
        <button className="btn3d flex-1" disabled={!name.trim() || busy} onClick={() => onSave({ name: name.trim(), note })}>บันทึก</button>
      </div>
      <p className="text-xs text-ink-3">ซ่อนแล้วจะไม่โผล่ให้เลือก แต่ยอดที่ติดอยู่และรายการเก่ายังอยู่ครบ</p>
    </div>
  );
}
