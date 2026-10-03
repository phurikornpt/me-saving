"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { personName } from "@/client/people";
import { useDashboard } from "@/client/queries";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Keypad } from "./Keypad";
import { PersonDot } from "./People";

/** Someone pays us back. Pick who (?person=<id> preselects), then how much. Never counted as income. */
export function RepayScreen() {
  const { data } = useDashboard();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const people = data?.people ?? [];
  const owing = (data?.balances ?? []).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const [picked, setPicked] = useState<string | null>(params.get("person"));
  // default: whoever owes the most
  const personId = owing.some((b) => b.personId === picked) ? picked! : (owing[0]?.personId ?? null);
  const balance = owing.find((b) => b.personId === personId)?.balance ?? 0;
  const name = personName(people, personId);
  const [amount, setAmount] = useState("");

  let total = 0;
  try {
    total = amount ? parseBaht(amount) : 0;
  } catch {
    total = 0;
  }
  const over = total > balance;

  const save = useMutation({
    mutationFn: (v: { personId: string; total: number }) => api.repay(v.personId, v.total),
    onMutate: (v) => applyOptimisticEntry(qc, { kind: "repayment", total: v.total, personId: v.personId }),
    onSuccess: (out, v) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      const who = personName(people, v.personId);
      fb.toast({
        message: out.balanceAfter === 0 ? `เคลียร์ยอด${who}ครบแล้ว!` : `${who} ยังติดอยู่ ฿${formatBaht(out.balanceAfter)}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (e, v, rollback) => {
      rollback?.();
      fb.toast({
        tone: "error",
        message: (e as ApiError).code === "REPAYMENT_EXCEEDS_BALANCE" ? "เกินยอดที่ติดอยู่" : "บันทึกไม่สำเร็จ",
        action: { label: "ลองใหม่", run: () => save.mutate(v) },
      });
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">รับเงินคืน</h1>
      </header>

      {owing.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-2" role="group" aria-label="ใครจ่ายคืน">
          {owing.map((b) => (
            <button key={b.personId} className="pill flex shrink-0 items-center gap-1.5 text-sm" aria-pressed={b.personId === personId} onClick={() => setPicked(b.personId)}>
              <PersonDot people={people} id={b.personId} /> {personName(people, b.personId)}
            </button>
          ))}
        </div>
      )}

      <section className="px-6 pt-6 text-center">
        <p className="text-sm text-ink-3">{personId ? `${name} ติดอยู่ ฿${formatBaht(balance)}` : "ไม่มีใครติดเรา"}</p>
        <div className={`font-bold text-6xl ${over ? "text-expense" : "text-partner"}`} aria-live="polite">
          <span className="text-3xl text-ink-3">฿ </span>
          {amount || "0"}
        </div>
        {over && <p className="mt-1 text-sm text-expense">เกินยอดที่ค้าง</p>}
        <button className="pill mt-4" onClick={() => setAmount(formatBaht(balance).replace(/,/g, ""))} disabled={balance === 0}>
          คืนครบทั้งหมด
        </button>
        <p className="mt-3 text-xs text-ink-3">เงินที่ได้คืนไม่นับเป็นรายรับ</p>
      </section>

      <div className="safe-bottom mt-auto space-y-4 pt-4">
        <Keypad value={amount} onChange={setAmount} />
        <div className="px-4">
          <button
            className="btn3d w-full py-4 text-lg"
            disabled={!personId || total === 0 || over || save.isPending}
            onClick={() => {
              save.mutate({ personId: personId!, total });
              router.replace("/");
            }}
          >
            บันทึก
          </button>
        </div>
      </div>
    </main>
  );
}
