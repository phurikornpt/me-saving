"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, describeFailure } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { activePeople, describeShares } from "@/client/people";
import { usePeople, useWallets } from "@/client/queries";
import { summarize, type DraftLine } from "@/client/receiptMath";
import { useAfterLog } from "@/client/useAfterLog";
import { bangkokDay } from "@/domain/day";
import { formatBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { ItemLines } from "./ItemLines";
import { PeoplePicker, SplitSummary } from "./People";
import { WalletPicker } from "./Wallets";

/** A group typed by hand ("ค่า 7-11": นม 10, ไก่ 50), each item with its own owners. Saved as one expense. */
export function ItemizedScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  const [walletId, setWalletId] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const onBill = activePeople(people).filter((p) => sharedWith.includes(p.id));
  // Taking someone off the bill takes them off every line too; a line left with nobody becomes ours.
  const changeSharedWith = (ids: string[]) => {
    setSharedWith(ids);
    setLines((ls) =>
      ls.map((l) => {
        const kept = l.owners.people.filter((id) => ids.includes(id));
        return { ...l, owners: { me: l.owners.me || kept.length === 0, people: kept } };
      }),
    );
  };

  const total = lines.reduce((s, l) => s + l.price, 0);
  const sum = summarize(lines, total);
  const today = bangkokDay(new Date());
  const backdated = !!day && day < today;

  const save = useMutation({
    mutationFn: (v: { name: string; lines: DraftLine[]; total: number; day: string; people: string[]; walletId: string | null }) =>
      api.saveReceipt({
        source: "itemized",
        merchant: v.name.trim() || null,
        occurredAt: v.day && v.day < today ? new Date(`${v.day}T12:00:00+07:00`).toISOString() : undefined,
        total: v.total,
        people: v.people,
        walletId: v.walletId ?? undefined,
        lines: v.lines.map((l) => ({
          rawName: l.rawName || l.canonicalName,
          canonicalName: l.canonicalName,
          qty: l.qty,
          price: l.price,
          owners: l.owners,
          categoryId: l.categoryId,
        })),
      }),
    onMutate: (v) =>
      v.day && v.day < today
        ? undefined // a backdated group doesn't belong in today's numbers
        : applyOptimisticEntry(qc, {
            kind: "expense", total: v.total, source: "itemized", merchant: v.name.trim() || "หลายรายการ",
            shares: summarize(v.lines, v.total).shares, walletId: v.walletId,
          }),
    onSuccess: (out) => {
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}${out.entry.shares.length ? ` · ${describeShares(people, out.entry.shares)}` : ""}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (e, v, rollback) => {
      rollback?.();
      fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e), action: { label: "ลองใหม่", run: () => save.mutate(v) } });
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">หลายรายการ</h1>
      </header>

      <section className="flex items-center gap-2 px-5 pb-3">
        <input
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อกลุ่ม เช่น ค่า 7-11 (ไม่ใส่ก็ได้)"
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
            aria-label="วันที่ (ค่าเริ่มต้นคือวันนี้)"
          />
        </label>
      </section>
      {backdated && <p className="-mt-2 px-6 pb-2 text-xs text-ink-3">จดย้อนหลัง: เงินถูกบันทึกในวันนั้น แต่ไม่ช่วยต่อ streak</p>}
      <section className="px-5 pb-3">
        <p className="mb-2 text-xs text-ink-3">หารกับใคร? (ไม่เลือก = ของเราทั้งหมด)</p>
        <PeoplePicker people={people} selected={sharedWith} onChange={changeSharedWith} label="หารกับใคร" />
      </section>
      {lines.length === 0 && <p className="px-5 pb-1 text-xs text-ink-3">เพิ่มทีละรายการ{onBill.length ? " แล้วเลือกว่าเป็นของใคร" : ""}</p>}

      <ItemLines lines={lines} onChange={setLines} onBill={onBill} addLabel="เพิ่มรายการ" startAdding />

      <div className="safe-bottom sticky bottom-0 border-t border-line bg-bg px-5 pt-3">
        <SplitSummary people={people} mine={sum.mine} shares={sum.shares} total={total} />
        <div className="mb-2">
          <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} label="จ่ายจากกระเป๋า" />
        </div>
        <button
          className="btn3d w-full py-4 text-lg"
          disabled={!sum.valid}
          onClick={() => {
            save.mutate({ name, lines, total, day, people: onBill.map((p) => p.id), walletId });
            router.replace("/");
          }}
        >
          บันทึก {lines.length > 0 && `${lines.length} รายการ`}
        </button>
      </div>
    </main>
  );
}
