"use client";

import { useState } from "react";
import { useCategories, usePeople } from "@/client/queries";
import { nextOwners, type DraftLine } from "@/client/receiptMath";
import type { LineOwners, PersonDTO } from "@/client/types";
import { formatBaht, parseBaht } from "@/domain/money";
import { ME_ONLY } from "@/domain/split";
import { Icon } from "./Icon";
import { OwnersChip, OwnersToggle } from "./People";
import { Sheet } from "./Sheet";

const blankLine = (): DraftLine => ({
  key: `new-${Date.now()}`, rawName: "", canonicalName: "", qty: 1, price: 0, categoryId: null, owners: ME_ONLY, lowConfidence: false,
});

/**
 * The editable lines of a group: a scanned receipt or one typed by hand. When the bill is shared
 * (`onBill` not empty) each line says who it's for: with one person the chip cycles เรา -> them -> หาร,
 * with more it opens a picker. Tap a name to edit the line.
 */
export function ItemLines({
  lines, onChange, onBill, addLabel, startAdding = false,
}: {
  lines: DraftLine[];
  onChange: (update: (ls: DraftLine[]) => DraftLine[]) => void;
  /** People sharing this bill. Empty = all ours, no owner chips. */
  onBill: PersonDTO[];
  addLabel: string;
  startAdding?: boolean;
}) {
  const { data: people = [] } = usePeople();
  const [editing, setEditing] = useState<DraftLine | null>(() => (startAdding ? blankLine() : null));
  const [picking, setPicking] = useState<DraftLine | null>(null);
  const shared = onBill.length > 0;
  const setAll = (owners: LineOwners) => onChange((ls) => ls.map((l) => ({ ...l, owners, lowConfidence: false })));
  const setOwners = (key: string, owners: LineOwners) =>
    onChange((ls) => ls.map((l) => (l.key === key ? { ...l, owners, lowConfidence: false } : l)));

  return (
    <>
      {shared && lines.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-3">
          <button className="pill shrink-0 text-sm" onClick={() => setAll(ME_ONLY)}>ทั้งหมดของเรา</button>
          <button className="pill shrink-0 text-sm" onClick={() => setAll({ me: true, people: onBill.map((p) => p.id) })}>หารทุกคน</button>
          {onBill.map((p) => (
            <button key={p.id} className="pill shrink-0 text-sm" onClick={() => setAll({ me: false, people: [p.id] })}>
              ทั้งหมดของ{p.name}
            </button>
          ))}
        </div>
      )}

      <ul className="flex-1 divide-y divide-line px-5">
        {lines.map((l) => (
          <li key={l.key} className={`flex items-center gap-3 py-3 ${l.lowConfidence ? "-mx-2 rounded-xl bg-streak/25 px-2" : ""}`}>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
              <span className="block truncate">{l.canonicalName}{l.qty > 1 && <span className="text-ink-3"> ×{l.qty}</span>}</span>
              <span className="block text-xs text-ink-3">฿{formatBaht(l.price)}{l.lowConfidence && " · AI ไม่แน่ใจ"}</span>
            </button>
            {shared && (
              <OwnersChip
                people={people}
                owners={l.owners}
                onClick={() => (onBill.length === 1 ? setOwners(l.key, nextOwners(l.owners, onBill[0].id)) : setPicking(l))}
              />
            )}
          </li>
        ))}
        <li className="py-3">
          <button className="flex items-center gap-2 text-sm text-ink-2" onClick={() => setEditing(blankLine())}>
            <Icon name="add" size={18} /> {addLabel}
          </button>
        </li>
      </ul>

      {picking && (
        <Sheet open onOpenChange={(o) => !o && setPicking(null)} title={`${picking.canonicalName} ของใคร`}>
          <p className="mb-3 text-xs text-ink-3">เลือกได้หลายคน ราคาจะหารเท่ากัน</p>
          <OwnersToggle
            people={people}
            onBill={onBill}
            owners={lines.find((l) => l.key === picking.key)?.owners ?? picking.owners}
            onChange={(o) => setOwners(picking.key, o)}
          />
          <button className="btn3d mt-4 w-full" onClick={() => setPicking(null)}>ตกลง</button>
        </Sheet>
      )}

      {editing && (
        <LineSheet
          line={editing}
          people={people}
          onBill={onBill}
          exists={lines.some((l) => l.key === editing.key)}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            onChange((ls) => (ls.some((x) => x.key === l.key) ? ls.map((x) => (x.key === l.key ? l : x)) : [...ls, l]));
            setEditing(null);
          }}
          onDelete={(key) => {
            onChange((ls) => ls.filter((l) => l.key !== key));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function LineSheet({
  line, people, onBill, exists, onClose, onSave, onDelete,
}: {
  line: DraftLine; people: PersonDTO[]; onBill: PersonDTO[]; exists: boolean;
  onClose: () => void; onSave: (l: DraftLine) => void; onDelete: (key: string) => void;
}) {
  const { data: categories = [] } = useCategories();
  const [name, setName] = useState(line.canonicalName);
  const [price, setPrice] = useState(line.price ? formatBaht(line.price).replace(/,/g, "") : "");
  const [qty, setQty] = useState(String(line.qty));
  const [categoryId, setCategoryId] = useState(line.categoryId);
  const [owners, setOwners] = useState<LineOwners>(line.owners);

  let satang = 0;
  try {
    satang = price ? parseBaht(price) : 0;
  } catch {
    satang = -1;
  }
  const ok = name.trim().length > 0 && satang >= 0 && Number(qty) >= 1;
  const sameOwners = owners.me === line.owners.me && owners.people.join() === line.owners.people.join();

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={exists ? "แก้รายการ" : "เพิ่มรายการ"}>
      <div className="flex flex-col gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" className="rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
        {line.rawName && line.rawName !== line.canonicalName && <p className="px-2 text-xs text-ink-3">ในบิล: {line.rawName}</p>}
        <div className="flex gap-2">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ราคารวม (บาท)" className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} aria-label="จำนวน" className="w-20 rounded-full border-2 border-line bg-card px-4 py-2 text-center outline-none focus:border-ink" />
        </div>
        {onBill.length > 0 && <OwnersToggle people={people} onBill={onBill} owners={owners} onChange={setOwners} />}
        <div className="flex flex-wrap gap-2">
          {categories.filter((c) => c.kind === "expense" && !c.archived).map((c) => (
            <button key={c.id} className="pill flex items-center gap-1 text-sm" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              <Icon name={c.icon} size={16} /> {c.name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-3">
          {exists && (
            <button className="btn3d key flex-1" style={{ ["--fg" as string]: "var(--expense)" }} onClick={() => onDelete(line.key)}>
              <Icon name="delete" size={20} /> ลบ
            </button>
          )}
          <button
            className="btn3d flex-1"
            disabled={!ok}
            onClick={() => onSave({ ...line, rawName: line.rawName || name.trim(), canonicalName: name.trim(), price: satang, qty: Number(qty), categoryId, owners, lowConfidence: sameOwners && line.lowConfidence })}
          >
            ตกลง
          </button>
        </div>
      </div>
    </Sheet>
  );
}
