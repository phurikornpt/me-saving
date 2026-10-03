"use client";

import { useState } from "react";
import { useCategories } from "@/client/queries";
import { NEXT_OWNER, type DraftLine } from "@/client/receiptMath";
import type { Owner } from "@/client/types";
import { formatBaht, parseBaht } from "@/domain/money";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const OWNER_LABEL: Record<Owner, string> = { me: "เรา", partner: "แฟน", split: "หาร" };
const OWNER_STYLE: Record<Owner, string> = {
  me: "bg-ink text-[var(--on-ink)]",
  partner: "bg-partner text-white",
  split: "bg-gradient-to-r from-ink to-partner text-white",
};

const blankLine = (): DraftLine => ({
  key: `new-${Date.now()}`, rawName: "", canonicalName: "", qty: 1, price: 0, categoryId: null, owner: "me", lowConfidence: false,
});

/**
 * The editable lines of a group: a scanned receipt or one typed by hand. Each line has its own owner
 * (tap the chip to cycle เรา → แฟน → หาร); tap a name to edit it.
 */
export function ItemLines({
  lines, onChange, addLabel, startAdding = false,
}: { lines: DraftLine[]; onChange: (update: (ls: DraftLine[]) => DraftLine[]) => void; addLabel: string; startAdding?: boolean }) {
  const [editing, setEditing] = useState<DraftLine | null>(() => (startAdding ? blankLine() : null));
  const setAll = (owner: Owner) => onChange((ls) => ls.map((l) => ({ ...l, owner, lowConfidence: false })));
  const patch = (key: string, p: Partial<DraftLine>) => onChange((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  return (
    <>
      {lines.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-3">
          <button className="pill shrink-0 text-sm" onClick={() => setAll("me")}>ทั้งหมดของเรา</button>
          <button className="pill shrink-0 text-sm" onClick={() => setAll("partner")}>ทั้งหมดของแฟน</button>
          <button className="pill shrink-0 text-sm" onClick={() => setAll("split")}>หารทั้งหมด</button>
        </div>
      )}

      <ul className="flex-1 divide-y divide-line px-5">
        {lines.map((l) => (
          <li key={l.key} className={`flex items-center gap-3 py-3 ${l.lowConfidence ? "-mx-2 rounded-xl bg-streak/25 px-2" : ""}`}>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
              <span className="block truncate">{l.canonicalName}{l.qty > 1 && <span className="text-ink-3"> ×{l.qty}</span>}</span>
              <span className="block text-xs text-ink-3">฿{formatBaht(l.price)}{l.lowConfidence && " · AI ไม่แน่ใจ"}</span>
            </button>
            <button
              className={`min-w-14 rounded-full px-3 py-1.5 text-sm font-medium ${OWNER_STYLE[l.owner]}`}
              onClick={() => patch(l.key, { owner: NEXT_OWNER[l.owner], lowConfidence: false })}
              aria-label={`เจ้าของ: ${OWNER_LABEL[l.owner]} (แตะเพื่อเปลี่ยน)`}
            >
              {OWNER_LABEL[l.owner]}
            </button>
          </li>
        ))}
        <li className="py-3">
          <button className="flex items-center gap-2 text-sm text-ink-2" onClick={() => setEditing(blankLine())}>
            <Icon name="add" size={18} /> {addLabel}
          </button>
        </li>
      </ul>

      {editing && (
        <LineSheet
          line={editing}
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
  line, exists, onClose, onSave, onDelete,
}: { line: DraftLine; exists: boolean; onClose: () => void; onSave: (l: DraftLine) => void; onDelete: (key: string) => void }) {
  const { data: categories = [] } = useCategories();
  const [name, setName] = useState(line.canonicalName);
  const [price, setPrice] = useState(line.price ? formatBaht(line.price).replace(/,/g, "") : "");
  const [qty, setQty] = useState(String(line.qty));
  const [categoryId, setCategoryId] = useState(line.categoryId);
  const [owner, setOwner] = useState<Owner>(line.owner);

  let satang = 0;
  try {
    satang = price ? parseBaht(price) : 0;
  } catch {
    satang = -1;
  }
  const ok = name.trim().length > 0 && satang >= 0 && Number(qty) >= 1;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={exists ? "แก้รายการ" : "เพิ่มรายการ"}>
      <div className="flex flex-col gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" className="rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
        {line.rawName && line.rawName !== line.canonicalName && <p className="px-2 text-xs text-ink-3">ในบิล: {line.rawName}</p>}
        <div className="flex gap-2">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ราคารวม (บาท)" className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} aria-label="จำนวน" className="w-20 rounded-full border-2 border-line bg-card px-4 py-2 text-center outline-none focus:border-ink" />
        </div>
        <div className="flex gap-2" role="group" aria-label="ของใคร">
          {(["me", "partner", "split"] as const).map((o) => (
            <button key={o} className="pill flex-1 text-sm" aria-pressed={owner === o} onClick={() => setOwner(o)}>
              {o === "me" ? "ของเรา" : o === "partner" ? "ของแฟน" : "หารกัน"}
            </button>
          ))}
        </div>
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
            onClick={() => onSave({ ...line, rawName: line.rawName || name.trim(), canonicalName: name.trim(), price: satang, qty: Number(qty), categoryId, owner, lowConfidence: owner === line.owner && line.lowConfidence })}
          >
            ตกลง
          </button>
        </div>
      </div>
    </Sheet>
  );
}
