"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { useDashboard } from "@/client/queries";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Keypad } from "./Keypad";

export function RepayScreen() {
  const { data } = useDashboard();
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const balance = data?.partnerBalance ?? 0;
  const [amount, setAmount] = useState("");

  let total = 0;
  try {
    total = amount ? parseBaht(amount) : 0;
  } catch {
    total = 0;
  }
  const over = total > balance;

  const save = useMutation({
    mutationFn: () => api.repay(total),
    onMutate: () => applyOptimisticEntry(qc, { kind: "repayment", total }),
    onSuccess: (out) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: out.balanceAfter === 0 ? "เคลียร์ยอดแฟนครบแล้ว!" : `เหลือที่แฟนติด ฿${formatBaht(out.balanceAfter)}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (e, _v, rollback) => {
      rollback?.();
      fb.toast({
        tone: "error",
        message: (e as ApiError).code === "REPAYMENT_EXCEEDS_BALANCE" ? "เกินยอดที่แฟนติดอยู่" : "บันทึกไม่สำเร็จ",
        action: { label: "ลองใหม่", run: () => save.mutate() },
      });
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">แฟนจ่ายคืน</h1>
      </header>

      <section className="px-6 pt-6 text-center">
        <p className="text-sm text-ink-3">แฟนติดอยู่ ฿{formatBaht(balance)}</p>
        <div className={`font-bold text-6xl ${over ? "text-expense" : "text-partner"}`} aria-live="polite">
          <span className="text-3xl text-ink-3">฿ </span>
          {amount || "0"}
        </div>
        {over && <p className="mt-1 text-sm text-expense">เกินยอดที่ค้าง</p>}
        <button className="pill mt-4" onClick={() => setAmount(formatBaht(balance).replace(/,/g, ""))} disabled={balance === 0}>
          คืนครบทั้งหมด
        </button>
        <p className="mt-3 text-xs text-ink-3">เงินที่แฟนจ่ายคืนไม่นับเป็นรายรับ</p>
      </section>

      <div className="safe-bottom mt-auto space-y-4 pt-4">
        <Keypad value={amount} onChange={setAmount} />
        <div className="px-4">
          <button className="btn3d w-full py-4 text-lg" disabled={total === 0 || over || save.isPending} onClick={() => {
              save.mutate();
              router.replace("/");
            }}>
            บันทึก
          </button>
        </div>
      </div>
    </main>
  );
}
