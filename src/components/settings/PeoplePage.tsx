"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/client/api";
import { usePeople } from "@/client/queries";
import type { PersonDTO } from "@/client/types";
import { useFeedback } from "../Feedback";
import { MeNoteField } from "../MeNoteField";
import { PersonDot } from "../People";
import { Sheet } from "../Sheet";
import { AddButton, areaClass, emptyHint, inputClass, SettingsGroup, SettingsPage } from "./ui";

type Editing = PersonDTO | "new" | null;

/** The people we front money for: a name, and a note that helps the AI guess what's theirs. */
export function PeoplePage() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data: people = [] } = usePeople();
  const [editing, setEditing] = useState<Editing>(null);
  const [showHidden, setShowHidden] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const unhide = useMutation({
    mutationFn: (id: string) => api.updatePerson(id, { archived: false }),
    onSuccess: refresh,
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ" }),
  });

  const active = people.filter((p) => !p.archived);
  const hidden = people.filter((p) => p.archived);

  return (
    <SettingsPage title="คนที่หารด้วย" action={<AddButton label="เพิ่มคน" onClick={() => setEditing("new")} />}>
      <SettingsGroup
        title="ตัวเรา"
        footer="ชื่อและโน้ตของคนที่เลือกตอน &quot;สแกนหารกัน&quot; รวมถึงพฤติกรรมของเรา ถูกส่งให้ Google (Gemini) เพื่อเดาว่าของชิ้นไหนเป็นของใคร ใช้ชื่อเล่นหรือความสัมพันธ์ (เช่น แฟน, แม่) และอย่าใส่ข้อมูลอ่อนไหว เช่น เรื่องสุขภาพ"
      >
        <MeNoteField />
      </SettingsGroup>

      <SettingsGroup title="คนที่ออกก่อนให้">
        {active.length === 0 && emptyHint("ยังไม่มีใคร กด “เพิ่มคน” ด้านบน")}
        {active.map((p) => (
          <button key={p.id} className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setEditing(p)}>
            <PersonDot people={people} id={p.id} size={12} />
            <span className="min-w-0 flex-1">
              <span className="block">{p.name}</span>
              {p.note && <span className="block truncate text-xs text-ink-3">{p.note}</span>}
            </span>
          </button>
        ))}
      </SettingsGroup>

      {hidden.length > 0 && (
        <div>
          <button className="px-2 text-xs text-ink-3 underline" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "ซ่อนรายการที่ซ่อนไว้" : `ดูคนที่ซ่อนไว้ (${hidden.length})`}
          </button>
          {showHidden && (
            <div className="mt-1">
              <SettingsGroup>
                {hidden.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 text-ink-3">
                    <span className="flex-1">{p.name}</span>
                    <button className="pill !py-1 text-xs" onClick={() => unhide.mutate(p.id)}>แสดงอีกครั้ง</button>
                  </div>
                ))}
              </SettingsGroup>
            </div>
          )}
        </div>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "เพิ่มคน" : "แก้คน"}>
        {editing && (
          <PersonForm
            key={editing === "new" ? "new" : editing.id}
            person={editing === "new" ? null : editing}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Sheet>
    </SettingsPage>
  );
}

function PersonForm({ person, onDone }: { person: PersonDTO | null; onDone: () => void }) {
  const fb = useFeedback();
  const [name, setName] = useState(person?.name ?? "");
  const [note, setNote] = useState(person?.note ?? "");
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.updatePerson>[1]) =>
      person ? api.updatePerson(person.id, patch) : api.createPerson({ name: name.trim(), note }),
    onSuccess: onDone,
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ ตรวจชื่ออีกครั้ง" }),
  });
  return (
    <div className="flex flex-col gap-3 pb-2">
      <input className={inputClass} placeholder="ชื่อ เช่น แฟน, แม่, A" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="ชื่อ" />
      <textarea
        className={areaClass}
        rows={3}
        maxLength={500}
        placeholder="พฤติกรรม (ไม่ใส่ก็ได้) เช่น ชอบนมเปรี้ยว กินขนมหวาน ไม่กินเผ็ด"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="พฤติกรรม"
      />
      <div className="flex gap-2">
        {person && (
          <button className="btn3d key flex-1" style={{ ["--fg" as string]: "var(--expense)" }} disabled={save.isPending} onClick={() => save.mutate({ archived: true })}>
            ซ่อน
          </button>
        )}
        <button className="btn3d flex-1" disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ name: name.trim(), note })}>
          {person ? "บันทึก" : "เพิ่มคน"}
        </button>
      </div>
      {person && <p className="text-xs text-ink-3">ซ่อนแล้วจะไม่โผล่ให้เลือก แต่ยอดที่ติดอยู่และรายการเก่ายังอยู่ครบ</p>}
    </div>
  );
}
