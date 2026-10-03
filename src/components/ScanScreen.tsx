"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/client/api";
import { useCategories } from "@/client/queries";
import { takePendingReceipt } from "@/client/receiptHandoff";
import { NEXT_OWNER, summarize, type DraftLine } from "@/client/receiptMath";
import { resizeForUpload } from "@/client/resizeImage";
import type { Owner, ReceiptDraftDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const OWNER_LABEL: Record<Owner, string> = { me: "เรา", partner: "แฟน", split: "หาร" };
const OWNER_STYLE: Record<Owner, string> = {
  me: "bg-ink text-[var(--on-ink)]",
  partner: "bg-partner text-white",
  split: "bg-gradient-to-r from-ink to-partner text-white",
};

type Header = { merchant: string | null; date: string | null };

export function ScanScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const [header, setHeader] = useState<Header | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<DraftLine | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const toLines = (draft: ReceiptDraftDTO) => {
    const catId = (name: string | null) => categories.find((c) => c.name === name && c.kind === "expense")?.id ?? null;
    setLines(
      draft.lines.map((l, i) => ({
        key: `${i}-${l.rawName}`,
        rawName: l.rawName,
        canonicalName: l.canonicalName,
        qty: l.qty,
        price: l.price,
        categoryId: catId(l.categoryName),
        owner: l.owner,
        lowConfidence: l.lowConfidence,
      })),
    );
    setTotal(draft.total);
    setHeader({ merchant: draft.merchant, date: draft.date });
  };

  const read = useMutation({
    mutationFn: async (file: File) => api.parseReceipt(await resizeForUpload(file)),
    onSuccess: toLines,
  });

  // The photo arrives from the dashboard wheel (in memory); start reading it once.
  useEffect(() => {
    const file = takePendingReceipt();
    if (file) read.mutate(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only: `read.mutate` is stable enough and must not retrigger

  const phase = header ? "review" : read.isPending ? "reading" : read.isError ? "failed" : "idle";
  const failCode = read.error instanceof ApiError ? read.error.code : "UNKNOWN";

  const sum = useMemo(() => summarize(lines, total), [lines, total]);

  const save = useMutation({
    mutationFn: () => {
      const date = header?.date ?? null;
      const today = new Date().toISOString().slice(0, 10);
      return api.saveReceipt({
        merchant: header?.merchant ?? null,
        occurredAt: date && date <= today ? new Date(`${date}T12:00:00+07:00`).toISOString() : undefined,
        total,
        lines: lines.map((l) => ({
          rawName: l.rawName,
          canonicalName: l.canonicalName,
          qty: l.qty,
          price: l.price,
          owner: l.owner,
          categoryId: l.categoryId,
          lowConfidence: l.lowConfidence,
        })),
      });
    },
    onSuccess: (out) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)} · แฟนติด ฿${formatBaht(out.entry.partnerShare)}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
      router.replace("/");
    },
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ ลองอีกครั้ง" }),
  });

  const setAll = (owner: Owner) => setLines((ls) => ls.map((l) => ({ ...l, owner, lowConfidence: false })));
  const patch = (key: string, p: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">สแกนใบเสร็จ</h1>
      </header>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) read.mutate(f);
        }}
      />

      {phase === "idle" && (
        <Center>
          <p className="text-ink-2">ถ่ายรูปหรือเลือกรูปใบเสร็จ</p>
          <button className="btn3d mt-4" onClick={() => picker.current?.click()}>
            <Icon name="photo_camera" /> เลือกรูป
          </button>
        </Center>
      )}

      {phase === "reading" && (
        <Center>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
          <p className="mt-4 text-ink-2">กำลังอ่านใบเสร็จ…</p>
        </Center>
      )}

      {phase === "failed" && (
        <Center>
          <Icon name="receipt_long" size={48} className="text-ink-3" />
          <p className="mt-3 max-w-xs text-center text-ink-2">
            {failCode === "AI_UNAVAILABLE"
              ? "AI พักอยู่ตอนนี้ ลองใหม่อีกครั้ง หรือกรอกยอดรวมเองไปก่อน"
              : failCode === "RATE_LIMITED"
                ? "สแกนครบโควตาของวันนี้แล้ว กรอกยอดรวมเองไปก่อนนะ"
                : failCode === "INVALID_RECEIPT"
                  ? "อ่านรายการจากรูปนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น"
                  : "สแกนไม่สำเร็จ ลองอีกครั้ง"}
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn3d key" onClick={() => picker.current?.click()}>ถ่ายใหม่</button>
            <Link href="/new?mode=front" className="btn3d">กรอกยอดเอง</Link>
          </div>
        </Center>
      )}

      {phase === "review" && (
        <>
          <div className="px-5 pb-2">
            <p className="truncate font-medium">{header?.merchant ?? "ใบเสร็จ"}</p>
            <p className="text-xs text-ink-3">แตะชิปเพื่อเปลี่ยนเจ้าของ · แตะชื่อเพื่อแก้</p>
          </div>

          <div className="flex gap-2 overflow-x-auto px-5 pb-3">
            <button className="pill shrink-0 text-sm" onClick={() => setAll("me")}>ทั้งหมดของเรา</button>
            <button className="pill shrink-0 text-sm" onClick={() => setAll("partner")}>ทั้งหมดของแฟน</button>
            <button className="pill shrink-0 text-sm" onClick={() => setAll("split")}>หารทั้งบิล</button>
          </div>

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
              <button
                className="flex items-center gap-2 text-sm text-ink-2"
                onClick={() =>
                  setEditing({ key: `new-${Date.now()}`, rawName: "", canonicalName: "", qty: 1, price: 0, categoryId: null, owner: "me", lowConfidence: false })
                }
              >
                <Icon name="add" size={18} /> เพิ่มรายการที่ AI อ่านตก
              </button>
            </li>
          </ul>

          <div className="safe-bottom sticky bottom-0 border-t border-line bg-bg px-5 pt-3">
            {sum.mismatch && (
              <p className="mb-2 rounded-xl bg-streak/40 px-3 py-2 text-xs" role="alert">
                ผลรวมรายการ ฿{formatBaht(sum.printed)} ไม่ตรงกับยอดที่จ่ายจริง ฿{formatBaht(total)} (อาจมีส่วนลด/VAT หรือ AI อ่านผิด) ระบบจะปรับสัดส่วนให้
                <label className="mt-1 flex items-center gap-2">
                  แก้ยอดที่จ่ายจริง ฿
                  <input
                    inputMode="decimal"
                    defaultValue={formatBaht(total).replace(/,/g, "")}
                    onBlur={(e) => {
                      try {
                        setTotal(parseBaht(e.target.value));
                      } catch {
                        /* keep the old total */
                      }
                    }}
                    className="w-24 rounded-full border border-line bg-card px-3 py-1"
                  />
                </label>
              </p>
            )}
            <div className="mb-3 flex justify-between text-sm">
              <span>ของเรา <b className="text-expense">฿{formatBaht(sum.mine)}</b></span>
              <span>ของแฟน <b className="text-partner">฿{formatBaht(sum.partner)}</b></span>
              <span>รวม <b>฿{formatBaht(total)}</b></span>
            </div>
            <button className="btn3d w-full py-4 text-lg" disabled={!sum.valid || save.isPending} onClick={() => save.mutate()}>
              บันทึก
            </button>
          </div>
        </>
      )}

      {editing && (
        <LineSheet
          line={editing}
          exists={lines.some((l) => l.key === editing.key)}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            setLines((ls) => (ls.some((x) => x.key === l.key) ? ls.map((x) => (x.key === l.key ? l : x)) : [...ls, l]));
            setEditing(null);
          }}
          onDelete={(key) => {
            setLines((ls) => ls.filter((l) => l.key !== key));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
);

function LineSheet({
  line, exists, onClose, onSave, onDelete,
}: { line: DraftLine; exists: boolean; onClose: () => void; onSave: (l: DraftLine) => void; onDelete: (key: string) => void }) {
  const { data: categories = [] } = useCategories();
  const [name, setName] = useState(line.canonicalName);
  const [price, setPrice] = useState(line.price ? formatBaht(line.price).replace(/,/g, "") : "");
  const [qty, setQty] = useState(String(line.qty));
  const [categoryId, setCategoryId] = useState(line.categoryId);

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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" className="rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
        {line.rawName && <p className="px-2 text-xs text-ink-3">ในบิล: {line.rawName}</p>}
        <div className="flex gap-2">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ราคารวม (บาท)" className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink" />
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} aria-label="จำนวน" className="w-20 rounded-full border-2 border-line bg-card px-4 py-2 text-center outline-none focus:border-ink" />
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
            onClick={() => onSave({ ...line, rawName: line.rawName || name.trim(), canonicalName: name.trim(), price: satang, qty: Number(qty), categoryId })}
          >
            ตกลง
          </button>
        </div>
      </div>
    </Sheet>
  );
}
