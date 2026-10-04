"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useBackOr } from "@/client/useBackOr";
import { useState } from "react";
import { api, describeFailure } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { useDashboard } from "@/client/queries";
import { activeWallets, defaultWalletId, walletName } from "@/client/wallets";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Keypad } from "./Keypad";
import { WalletPicker } from "./Wallets";

/** Move money between two of our wallets (cash out of the bank, paying the card). Not spending, not income. */
export function TransferScreen() {
  const { data } = useDashboard();
  const router = useRouter();
  const goBack = useBackOr();
  const qc = useQueryClient();
  const fb = useFeedback();
  const wallets = data?.wallets ?? [];
  const active = activeWallets(wallets);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // default: out of the default wallet, into the next one
  const fromId = from ?? defaultWalletId(wallets);
  const toId = to && to !== fromId ? to : (active.find((w) => w.id !== fromId)?.id ?? null);

  let total = 0;
  try {
    total = amount ? parseBaht(amount) : 0;
  } catch {
    total = 0;
  }

  const save = useMutation({
    mutationFn: (v: { from: string; to: string; total: number; note: string | null }) =>
      api.transfer({ fromWalletId: v.from, toWalletId: v.to, amount: v.total, note: v.note }),
    onMutate: (v) =>
      applyOptimisticEntry(qc, { kind: "transfer", total: v.total, walletId: v.from, toWalletId: v.to, note: v.note }),
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["wallets"] });
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `โอนแล้ว ฿${formatBaht(out.entry.total)}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
    },
    onError: (e, v, rollback) => {
      rollback?.();
      fb.toast({ tone: "error", message: describeFailure("โอนไม่สำเร็จ", e), action: { label: "ลองใหม่", run: () => save.mutate(v) } });
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={goBack}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">โอนระหว่างกระเป๋า</h1>
      </header>

      {active.length < 2 ? (
        <p className="px-6 pt-6 text-sm text-ink-3">ต้องมีกระเป๋าอย่างน้อย 2 ใบ เพิ่มได้ที่หน้าตั้งค่า</p>
      ) : (
        <>
          <section className="flex flex-col gap-2 px-4 pt-2">
            <p className="text-xs text-ink-3">จาก</p>
            <WalletPicker wallets={wallets} value={fromId} onChange={setFrom} label="โอนจาก" />
            <p className="text-xs text-ink-3">ไปที่</p>
            <WalletPicker wallets={wallets} value={toId} onChange={setTo} exclude={fromId} label="โอนไป" />
          </section>

          <section className="px-6 pt-6 text-center">
            <p className="text-sm text-ink-3">
              {walletName(wallets, fromId)} → {walletName(wallets, toId)}
            </p>
            <div className="font-bold text-6xl" aria-live="polite">
              <span className="text-3xl text-ink-3">฿ </span>
              {amount || "0"}
            </div>
            <p className="mt-3 text-xs text-ink-3">ไม่นับเป็นรายจ่ายหรือรายรับ</p>
          </section>

          <section className="px-4 pt-4">
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="โน้ต เช่น จ่ายบัตร (ไม่ใส่ก็ได้)"
              className="w-full rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
            />
          </section>
        </>
      )}

      <div className="safe-bottom mt-auto space-y-4 pt-4">
        <Keypad value={amount} onChange={setAmount} />
        <div className="px-4">
          <button
            className="btn3d w-full py-4 text-lg"
            disabled={!fromId || !toId || total === 0 || save.isPending}
            onClick={() => {
              save.mutate({ from: fromId!, to: toId!, total, note: note.trim() || null });
              router.replace("/");
            }}
          >
            โอน
          </button>
        </div>
      </div>
    </main>
  );
}
