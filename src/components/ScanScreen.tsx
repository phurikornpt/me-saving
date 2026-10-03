"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { useCategories } from "@/client/queries";
import { summarize, type DraftLine } from "@/client/receiptMath";
import { resizeForUpload } from "@/client/resizeImage";
import type { ReceiptDraftDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { bangkokDay } from "@/domain/day";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { ReadingReceipt, Spinner } from "./Loading";
import { ItemLines } from "./ItemLines";

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
  const [totalText, setTotalText] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);

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
    // If the model couldn't read the paid total, fall back to what the lines add up to,
    // otherwise the save button would sit disabled with no explanation.
    const paid = draft.total > 0 ? draft.total : draft.lines.reduce((sum, l) => sum + l.price, 0);
    setTotal(paid);
    setTotalText(formatBaht(paid).replace(/,/g, ""));
    setHeader({ merchant: draft.merchant, date: draft.date });
  };

  const read = useMutation({
    mutationFn: async (file: File) => api.parseReceipt(await resizeForUpload(file)),
    onSuccess: toLines,
  });

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) read.mutate(f);
  };

  const phase = header ? "review" : read.isPending ? "reading" : read.isError ? "failed" : "idle";
  const failCode = read.error instanceof ApiError ? read.error.code : "UNKNOWN";

  const sum = useMemo(() => summarize(lines, total), [lines, total]);

  const save = useMutation({
    mutationFn: () => {
      const date = header?.date ?? null;
      const today = bangkokDay(new Date());
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
    onError: (e) => fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e) }),
  });


  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">สแกนใบเสร็จ</h1>
      </header>

      {/* Two inputs: `capture` forces the camera on phones, so the album needs its own */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} />
      <input ref={album} type="file" accept="image/*" className="hidden" onChange={onPicked} />

      {phase === "idle" && (
        <Center>
          <Icon name="receipt_long" size={56} className="text-ink-3" />
          <p className="mt-3 text-ink-2">ถ่ายรูปหรือเลือกรูปใบเสร็จ</p>
          <div className="mt-5 flex w-full max-w-xs flex-col gap-4">
            <button className="btn3d py-4 text-lg" onClick={() => camera.current?.click()}>
              <Icon name="photo_camera" /> ถ่ายรูป
            </button>
            <button className="btn3d key py-4 text-lg" onClick={() => album.current?.click()}>
              <Icon name="add_photo_alternate" /> เลือกจากอัลบั้ม
            </button>
          </div>
        </Center>
      )}

      {phase === "reading" && (
        <Center>
          <ReadingReceipt />
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
            <button className="btn3d key" onClick={() => album.current?.click()}>เลือกรูปใหม่</button>
            <Link href="/itemized" className="btn3d">กรอกเอง</Link>
          </div>
        </Center>
      )}

      {phase === "review" && (
        <>
          <div className="px-5 pb-2">
            <p className="truncate font-medium">{header?.merchant ?? "ใบเสร็จ"}</p>
            <p className="text-xs text-ink-3">แตะชิปเพื่อเปลี่ยนเจ้าของ · แตะชื่อเพื่อแก้</p>
          </div>

          <ItemLines lines={lines} onChange={setLines} addLabel="เพิ่มรายการที่ AI อ่านตก" />

          <div className="safe-bottom sticky bottom-0 border-t border-line bg-bg px-5 pt-3">
            {(sum.mismatch || total === 0) && (
              <p className="mb-2 rounded-xl bg-streak/40 px-3 py-2 text-xs" role="alert">
                ผลรวมรายการ ฿{formatBaht(sum.printed)} ไม่ตรงกับยอดที่จ่ายจริง ฿{formatBaht(total)} (อาจมีส่วนลด/VAT หรือ AI อ่านผิด) ระบบจะปรับสัดส่วนให้
                <label className="mt-1 flex items-center gap-2">
                  แก้ยอดที่จ่ายจริง ฿
                  <input
                    inputMode="decimal"
                    value={totalText}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setTotalText(v);
                      try {
                        setTotal(v ? parseBaht(v) : 0);
                      } catch {
                        /* half-typed number like "12." : keep the previous total */
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
              {save.isPending ? <><Spinner /> กำลังบันทึก…</> : "บันทึก"}
            </button>
            {!sum.valid && (
              <p className="mt-1 text-center text-xs text-expense" role="status">
                {lines.length === 0 ? "ไม่มีรายการ เพิ่มรายการก่อน" : total === 0 ? "ใส่ยอดที่จ่ายจริงก่อน" : "ราคารายการรวมเป็น 0 แก้ราคาก่อน"}
              </p>
            )}
          </div>
        </>
      )}

    </main>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
);
