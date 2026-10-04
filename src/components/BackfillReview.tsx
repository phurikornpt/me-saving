"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, describeFailure } from "@/client/api";
import { DUR, staggerDelay } from "@/client/motion";
import { canSave, summarizeRows, toSaveRows, type BackfillRow } from "@/client/backfill";
import { useCategories, useWallets } from "@/client/queries";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Spinner } from "./Loading";
import { WalletPicker } from "./Wallets";

const dayLabel = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** Past entries read from a bank-history page or several pictures: tick, fix, save them all at once. */
export function BackfillReview({ initial, failed, onCancel }: { initial: BackfillRow[]; failed: number; onCancel: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const { data: wallets = [] } = useWallets();
  const [rows, setRows] = useState(initial);
  const [walletId, setWalletId] = useState<string | null>(null);
  const sum = summarizeRows(rows);
  const dupCount = rows.filter((r) => r.duplicate).length;

  const patch = (key: string, p: Partial<BackfillRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = useMutation({
    mutationFn: () => api.saveBackfill({ walletId: walletId ?? undefined, rows: toSaveRows(rows) }),
    onSuccess: (out) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดย้อนหลังแล้ว ${out.entries.length} รายการ`,
        action: { label: "ย้อนกลับ", run: () => void Promise.all(out.entries.map((e) => api.deleteEntry(e.id))).then(() => qc.invalidateQueries()) },
      });
      router.replace("/");
    },
    onError: (e) => fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e) }),
  });

  return (
    <>
      <div className="px-5 pb-2">
        <p className="font-medium">จดย้อนหลัง {rows.length} รายการ</p>
        <p className="text-xs text-ink-3">
          ติ๊กรายการที่จะจด แก้ได้ทุกช่อง
          {dupCount > 0 && ` · ${dupCount} รายการอาจซ้ำกับที่จดไว้ (ไม่ได้ติ๊กให้)`}
          {failed > 0 && ` · อ่านไม่ได้ ${failed} รูป`}
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3">
        {rows.map((r, i) => (
          <motion.li
            key={r.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: r.selected ? 1 : 0.6, y: 0 }}
            transition={{ duration: DUR.base, delay: staggerDelay(i, 0.05, 0.45) }}
            className={`rounded-2xl bg-card p-3 ${r.duplicate ? "flash-once ring-1 ring-streak" : ""}`}
          >
            <div className="flex items-center gap-2">
              <input type="checkbox" className="size-5" checked={r.selected} onChange={(e) => patch(r.key, { selected: e.target.checked })} aria-label="จดรายการนี้" />
              <span className="w-12 shrink-0 text-xs text-ink-3">{dayLabel(r.day)}</span>
              <input
                value={r.description}
                onChange={(e) => patch(r.key, { description: e.target.value })}
                aria-label="รายละเอียด"
                className="min-w-0 flex-1 bg-transparent"
              />
              <button
                type="button"
                aria-label={r.kind === "income" ? "รายรับ แตะเพื่อเปลี่ยนเป็นรายจ่าย" : "รายจ่าย แตะเพื่อเปลี่ยนเป็นรายรับ"}
                className={`w-6 text-lg font-medium ${r.kind === "income" ? "text-income" : "text-expense"}`}
                onClick={() => patch(r.key, { kind: r.kind === "income" ? "expense" : "income", categoryId: null })}
              >
                {r.kind === "income" ? "+" : "−"}
              </button>
              <input
                // Uncontrolled so half-typed numbers like "12." survive; parsed when the field is left.
                key={`${r.key}-${r.amount}`}
                inputMode="decimal"
                defaultValue={formatBaht(r.amount).replace(/,/g, "")}
                aria-label="จำนวนเงิน"
                onBlur={(e) => {
                  try {
                    patch(r.key, { amount: parseBaht(e.target.value.replace(/[^\d.]/g, "")) });
                  } catch {
                    patch(r.key, { amount: 0 });
                  }
                }}
                className={`w-20 rounded-full border bg-bg px-3 py-1 text-right ${r.selected && r.amount <= 0 ? "border-expense" : "border-line"}`}
              />
            </div>
            <div className="mt-2 flex items-center gap-2 pl-7">
              <select
                value={r.categoryId ?? ""}
                onChange={(e) => patch(r.key, { categoryId: e.target.value || null })}
                aria-label="หมวด"
                className="min-w-0 flex-1 rounded-full border border-line bg-bg px-3 py-1 text-sm"
              >
                <option value="">ไม่ระบุหมวด</option>
                {categories
                  .filter((c) => c.kind === r.kind && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              {r.duplicate && <span className="shrink-0 text-xs text-ink-2">อาจซ้ำ</span>}
            </div>
          </motion.li>
        ))}
      </ul>

      <div className="safe-bottom sticky bottom-0 border-t border-line bg-bg px-5 pt-3">
        <p className="mb-2 text-sm text-ink-2">
          เลือก {sum.count} รายการ · จ่าย ฿{formatBaht(sum.out)}
          {sum.in > 0 && ` · รับ ฿${formatBaht(sum.in)}`}
        </p>
        <div className="mb-2">
          <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} label="เข้ากระเป๋า" />
        </div>
        <div className="flex gap-3">
          <button className="btn3d" onClick={onCancel} disabled={save.isPending}>
            ยกเลิก
          </button>
          <button className="btn3d flex-1 py-4 text-lg" disabled={!canSave(rows) || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <><Spinner /> กำลังบันทึก…</> : `บันทึก ${sum.count} รายการ`}
          </button>
        </div>
        {!canSave(rows) && (
          <p className="mt-1 text-center text-xs text-expense" role="status">
            {sum.count === 0 ? "ติ๊กอย่างน้อย 1 รายการ" : "มีรายการที่ยังไม่ใส่จำนวนเงิน"}
          </p>
        )}
      </div>
    </>
  );
}
