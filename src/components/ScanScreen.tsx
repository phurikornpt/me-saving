"use client";

import { FORWARD } from "@/client/nav";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBackOr } from "@/client/useBackOr";
import { useMemo, useRef, useState } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { applyDuplicates, rowsFromDraft, type BackfillRow } from "@/client/backfill";
import { activePeople, describeShares } from "@/client/people";
import { useAiBudget, useCategories, usePeople, useWallets } from "@/client/queries";
import { summarize, type DraftLine } from "@/client/receiptMath";
import { occurredAtFor, usableScanDay } from "@/client/occurredAt";
import { resizeForUpload } from "@/client/resizeImage";
import type { ReceiptDraftDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { bangkokDay } from "@/domain/day";
import { formatBaht, parseBaht } from "@/domain/money";
import { AiBudgetNote } from "./AiBudgetNote";
import { BackfillReview } from "./BackfillReview";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { AuroraCloud } from "./AuroraCloud";
import { ReadingCloud, Spinner, type ReadingStage } from "./Loading";
import { ScanStrip, type PicState } from "./ScanStrip";
import { ItemLines } from "./ItemLines";
import { PeoplePicker, SplitSummary } from "./People";
import { WalletPicker } from "./Wallets";

const KIND_LABEL: Record<ReceiptDraftDTO["kind"], string> = {
  receipt: "ใบเสร็จ",
  delivery: "ออเดอร์เดลิเวอรี่",
  online_order: "ออเดอร์ออนไลน์",
  transfer_slip: "สลิปโอน",
  history: "หน้าประวัติรายการ",
};

/** Pictures read in one go. Each one costs one AI call from the daily budget. */
const MAX_PICTURES = 10;

/**
 * One scan button, two jobs: with nobody picked it just reads the lines off the receipt (all ours);
 * pick the people sharing the bill first and the AI also guesses who each line is for.
 */
export function ScanScreen() {
  const router = useRouter();
  const goBack = useBackOr();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  const { data: budget } = useAiBudget();
  const [walletId, setWalletId] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const onBill = activePeople(people).filter((p) => sharedWith.includes(p.id));
  const [reviewing, setReviewing] = useState(false);
  const [kind, setKind] = useState<ReceiptDraftDTO["kind"]>("receipt");
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const today = bangkokDay(new Date());
  const backdated = !!day && day < today;
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [total, setTotal] = useState(0);
  const [totalText, setTotalText] = useState("");
  const [rows, setRows] = useState<BackfillRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [stage, setStage] = useState<ReadingStage>("resize");
  const [pics, setPics] = useState<PicState[]>([]);
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
        owners: l.owners,
        lowConfidence: l.lowConfidence,
      })),
    );
    // If the model couldn't read the paid total, fall back to what the lines add up to,
    // otherwise the save button would sit disabled with no explanation.
    const paid = draft.total > 0 ? draft.total : draft.lines.reduce((sum, l) => sum + l.price, 0);
    setTotal(paid);
    setTotalText(formatBaht(paid).replace(/,/g, ""));
    setKind(draft.kind);
    setName(draft.merchant ?? "");
    setDay(usableScanDay(draft.date, today));
    setReviewing(true);
  };

  // One picture of a shop receipt / order keeps the itemised review. A history page, or several
  // pictures at once, becomes a list of past entries to tick and save together (backfill).
  const read = useMutation({
    mutationFn: async (files: File[]) => {
      const today = bangkokDay(new Date());
      const drafts: ReceiptDraftDTO[] = [];
      let failed = 0;
      let firstError: unknown;
      const mark = (i: number, s: PicState) => setPics((p) => p.map((x, j) => (j === i ? s : x)));
      setPics(files.map(() => "wait"));
      for (const [i, file] of files.entries()) {
        setProgress(files.length > 1 ? `${i + 1}/${files.length}` : null);
        mark(i, "reading");
        try {
          setStage("resize"); // the two steps the user waits through are real: shrink the photo, then the AI
          const small = await resizeForUpload(file);
          setStage("ai");
          drafts.push(await api.parseReceipt(small, files.length === 1 ? onBill.map((p) => p.id) : []));
          mark(i, "ok");
        } catch (e) {
          mark(i, "failed");
          failed++;
          firstError ??= e;
        }
      }
      if (drafts.length === 0) throw firstError;
      if (drafts.length === 1 && files.length === 1 && drafts[0].kind !== "history") return { drafts, failed, rows: null };
      let found = drafts.flatMap((d, i) => rowsFromDraft(d, categories, today, `p${i}`));
      if (found.length === 0) throw firstError ?? new ApiError(422, "INVALID_RECEIPT", "nothing readable");
      try {
        const { duplicates } = await api.checkBackfill(found.map((r) => ({ day: r.day, total: r.amount, kind: r.kind, description: r.description })));
        found = applyDuplicates(found, duplicates);
      } catch {
        /* the duplicate hint is optional: show the rows without it */
      }
      return { drafts, failed, rows: found };
    },
    onSuccess: ({ drafts, failed, rows: found }) => {
      setProgress(null);
      if (found) {
        setSkipped(failed);
        setRows(found);
      } else toLines(drafts[0]);
    },
    onError: () => setProgress(null),
    // Each picture read used one AI call, whether it worked or not.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["aiBudget"] }),
  });

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_PICTURES);
    e.target.value = "";
    if (picked.length === 0) return;
    // One picture = one AI call: never start more than the allowance left, and say so.
    const left = budget?.remaining ?? null;
    if (left !== null && left < picked.length) {
      if (left === 0) {
        fb.toast({ tone: "error", message: "ใช้ AI ครบโควตาแล้ว ลองใหม่ภายหลัง หรือจดเอง" });
        return;
      }
      fb.toast({ message: `AI เหลือ ${left} ครั้ง จะอ่านแค่ ${left} รูปแรก` });
    }
    read.mutate(left === null ? picked : picked.slice(0, left));
  };

  const phase = rows ? "backfill" : reviewing ? "review" : read.isPending ? "reading" : read.isError ? "failed" : "idle";
  const failCode = read.error instanceof ApiError ? read.error.code : "UNKNOWN";

  const sum = useMemo(() => summarize(lines, total), [lines, total]);

  const save = useMutation({
    mutationFn: () => {
      return api.saveReceipt({
        merchant: name.trim() || null,
        occurredAt: occurredAtFor(day, today),
        total,
        people: onBill.map((p) => p.id),
        walletId: walletId ?? undefined,
        lines: lines.map((l) => ({
          rawName: l.rawName,
          canonicalName: l.canonicalName,
          qty: l.qty,
          price: l.price,
          owners: l.owners,
          categoryId: l.categoryId,
          lowConfidence: l.lowConfidence,
        })),
      });
    },
    onSuccess: (out) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}${out.entry.shares.length ? ` · ${describeShares(people, out.entry.shares)}` : ""}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
      router.replace("/");
    },
    onError: (e) => fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e) }),
  });


  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={goBack}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">{rows ? "จดย้อนหลัง" : onBill.length ? "สแกนหารกัน" : "สแกน"}</h1>
      </header>

      {/* Two inputs: `capture` forces the camera on phones, so the album needs its own */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} />
      <input ref={album} type="file" accept="image/*" multiple className="hidden" onChange={onPicked} />

      {phase === "idle" && (
        <Center>
          <Icon name="receipt_long" size={56} className="text-ink-3" />
          <p className="mt-3 text-center text-ink-2">
            ถ่ายรูปหรือเลือกรูป
            <br />
            <span className="text-sm text-ink-3">ใบเสร็จ · ออเดอร์เดลิเวอรี่/ช้อปออนไลน์ (แคปหน้าจอ) · สลิปโอน</span>
            <br />
            <span className="text-sm text-ink-3">ลืมจดหลายวัน? แคปหน้าประวัติในแอปธนาคาร หรือเลือกหลายรูปพร้อมกัน (สูงสุด {MAX_PICTURES} · รูปละ 1 ครั้งของโควตา AI)</span>
          </p>
          <div className="mt-5 w-full max-w-xs rounded-2xl bg-card p-4">
            <p className="mb-2 text-sm text-ink-3">หารกับใคร? (ไม่เลือก = แค่แกะรายการ ของเราทั้งหมด)</p>
            <PeoplePicker people={people} selected={sharedWith} onChange={setSharedWith} label="หารกับใคร" />
            {onBill.length > 0 && <p className="mt-2 text-xs text-ink-3">AI จะเดาว่าแต่ละรายการเป็นของใคร จากชื่อและโน้ตของแต่ละคน</p>}
          </div>
          <AiBudgetNote className="mt-3" />
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
          {pics.length > 1 && <ScanStrip states={pics} />}
          <ReadingCloud stage={stage} progress={progress} />
        </Center>
      )}

      {phase === "failed" && (
        <Center>
          <AuroraCloud mode="error" pulse={0} className="h-[200px] w-[200px]" />
          <p className="-mt-2 max-w-xs text-center text-ink-2">
            {failCode === "AI_UNAVAILABLE"
              ? "AI พักอยู่ตอนนี้ ลองใหม่อีกครั้ง หรือกรอกยอดรวมเองไปก่อน"
              : failCode === "RATE_LIMITED"
                ? "สแกนครบโควตาของวันนี้แล้ว กรอกยอดรวมเองไปก่อนนะ"
                : failCode === "INVALID_RECEIPT"
                  ? "อ่านรายการจากรูปนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น หรือรูปนี้อาจไม่ใช่ใบเสร็จ ออเดอร์ หรือสลิป"
                  : "สแกนไม่สำเร็จ ลองอีกครั้ง"}
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn3d key" onClick={() => album.current?.click()}>เลือกรูปใหม่</button>
            <Link href="/itemized" transitionTypes={FORWARD} className="btn3d">กรอกเอง</Link>
          </div>
        </Center>
      )}

      {phase === "backfill" && rows && (
        <BackfillReview
          initial={rows}
          failed={skipped}
          onCancel={() => {
            setRows(null);
            read.reset();
          }}
        />
      )}

      {phase === "review" && (
        <>
          <section className="flex items-center gap-2 px-5 pb-2">
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อกลุ่ม เช่น ค่า 7-11 (ไม่ใส่ก็ได้)"
              aria-label="ชื่อกลุ่ม"
              className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
            />
            <label className="pill flex items-center gap-1 text-sm">
              <Icon name="calendar_month" size={18} />
              <input
                type="date"
                value={day}
                max={today}
                onChange={(e) => setDay(e.target.value)}
                className="w-[7.5rem] bg-transparent text-xs outline-none"
                aria-label="วันที่จ่าย (ค่าเริ่มต้นคือวันนี้)"
              />
            </label>
          </section>
          {backdated && <p className="px-6 pb-1 text-xs text-ink-3">จดย้อนหลัง: เงินถูกบันทึกในวันนั้น แต่ไม่ช่วยต่อ streak</p>}
          <p className="px-6 pb-2 text-xs text-ink-3">
            {KIND_LABEL[kind]} · {onBill.length ? "แตะชิปเพื่อเปลี่ยนว่าของใคร · ค่าส่ง/ค่าบริการหารเท่ากันทุกคน · " : ""}แตะชื่อรายการเพื่อแก้
          </p>

          <ItemLines lines={lines} onChange={setLines} onBill={onBill} addLabel="เพิ่มรายการที่ AI อ่านตก" reveal />

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
            <SplitSummary people={people} mine={sum.mine} shares={sum.shares} total={total} />
            <div className="mb-2">
              <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} label="จ่ายจากกระเป๋า" />
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
