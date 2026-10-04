"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackOr } from "@/client/useBackOr";
import { useState } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { activePeople, personName } from "@/client/people";
import { usePeople, useWallets } from "@/client/queries";
import { summarize, type DraftLine } from "@/client/receiptMath";
import type { EntryDetailDTO } from "@/client/types";
import { bangkokDay } from "@/domain/day";
import { formatBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { ItemLines } from "./ItemLines";
import { Skeleton } from "./Loading";
import { ownersLabel, PeoplePicker, SplitSummary } from "./People";
import { WalletPicker } from "./Wallets";

/** One group entry (a scanned receipt or items typed by hand): see its lines, and edit them until someone pays it back. */
export function GroupEntryScreen({ id }: { id: string }) {
  const goBack = useBackOr();
  const { data, isError } = useQuery({ queryKey: ["entry", id], queryFn: () => api.entryDetail(id) });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={goBack}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl">{data?.entry.merchant || "หลายรายการ"}</h1>
      </header>
      {isError && <p className="px-5 py-10 text-center text-ink-2">โหลดรายการไม่สำเร็จ</p>}
      {!data && !isError && (
        <div className="flex flex-col gap-3 px-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {/* key: rebuild the form from fresh data after a save */}
      {data && (data.repaidBy.length ? <Frozen data={data} /> : <Editor key={data.entry.total + data.entry.occurredAt} data={data} />)}
    </main>
  );
}

/** Someone already paid part of it back: the lines are shown, not editable. */
function Frozen({ data }: { data: EntryDetailDTO }) {
  const { data: people = [] } = usePeople();
  const who = data.repaidBy.map((p) => personName(people, p)).join(", ");
  return (
    <>
      <p className="mx-5 mb-3 flex items-start gap-2 rounded-2xl bg-card p-3 text-sm text-ink-2" role="status">
        <Icon name="check" size={20} className="text-income" />
        {who} จ่ายคืนแล้วบางส่วน รายการนี้จึงแก้ยอด รายการย่อย และวันที่ไม่ได้ (แก้ชื่อหรือโน้ตได้จากหน้าหลัก)
      </p>
      <ul className="divide-y divide-line px-5">
        {data.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.canonicalName}{l.qty > 1 && <span className="text-ink-3"> ×{l.qty}</span>}</span>
              <span className="block text-xs text-ink-3">฿{formatBaht(l.price)}</span>
            </span>
            {(l.owners.people.length > 0 || !l.owners.me) && <span className="text-sm text-ink-2">{ownersLabel(people, l.owners)}</span>}
          </li>
        ))}
      </ul>
      <p className="px-5 pt-3 text-right">รวม <b>฿{formatBaht(data.entry.total)}</b></p>
    </>
  );
}

const ERRORS: Record<string, string> = {
  ENTRY_REPAID: "แก้ไม่ได้: มีคนจ่ายคืนรายการนี้ไปแล้ว หรือวันที่ใหม่จะไปกระทบรายการที่จ่ายคืนแล้ว",
  BALANCE_WOULD_GO_NEGATIVE: "แก้ไม่ได้: มีคนจ่ายคืนไปแล้วมากกว่ายอดที่จะค้างหลังแก้",
};

function Editor({ data }: { data: EntryDetailDTO }) {
  const goBack = useBackOr();
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  const { entry } = data;
  const originalDay = bangkokDay(new Date(entry.occurredAt));
  const [name, setName] = useState(entry.merchant ?? "");
  const [day, setDay] = useState(originalDay);
  const [walletId, setWalletId] = useState<string | null>(entry.walletId);
  const [lines, setLines] = useState<DraftLine[]>(() => data.lines.map((l, i) => ({ ...l, key: `l${i}` })));
  const [sharedWith, setSharedWith] = useState<string[]>(() => [...new Set(data.lines.flatMap((l) => l.owners.people))]);
  // the people already on this bill stay pickable even if they've been hidden since
  const pickable = people.map((p) => (sharedWith.includes(p.id) ? { ...p, archived: false } : p));
  const onBill = activePeople(pickable).filter((p) => sharedWith.includes(p.id));
  const changeSharedWith = (ids: string[]) => {
    setSharedWith(ids);
    setLines((ls) =>
      ls.map((l) => {
        const kept = l.owners.people.filter((pid) => ids.includes(pid));
        return { ...l, owners: { me: l.owners.me || kept.length === 0, people: kept } };
      }),
    );
  };
  const total = lines.reduce((s, l) => s + l.price, 0);
  const sum = summarize(lines, total);
  const today = bangkokDay(new Date());

  const save = useMutation({
    mutationFn: () =>
      api.updateGroup(entry.id, {
        merchant: name.trim() || null,
        // keep the exact time unless the day itself changed
        occurredAt: day !== originalDay ? new Date(`${day}T12:00:00+07:00`).toISOString() : undefined,
        total,
        people: onBill.map((p) => p.id),
        walletId: walletId ?? undefined,
        lines: lines.map((l) => ({
          rawName: l.rawName || l.canonicalName, canonicalName: l.canonicalName, qty: l.qty, price: l.price, owners: l.owners, categoryId: l.categoryId,
        })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      fb.toast({ message: "แก้ไขแล้ว" });
      goBack();
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : "";
      fb.toast({ tone: "error", ms: 9000, message: ERRORS[code] ?? describeFailure("บันทึกไม่สำเร็จ", e) });
      if (code === "ENTRY_REPAID") void qc.invalidateQueries({ queryKey: ["entry", entry.id] });
    },
  });

  return (
    <>
      <section className="flex items-center gap-2 px-5 pb-3">
        <input
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อกลุ่ม หรือร้าน"
          className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <label className="pill flex items-center gap-1 text-sm">
          <Icon name="calendar_month" size={18} />
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-[7.5rem] bg-transparent text-xs outline-none" aria-label="วันที่" />
        </label>
      </section>
      <section className="px-5 pb-3">
        <p className="mb-2 text-xs text-ink-3">หารกับใคร? (ไม่เลือก = ของเราทั้งหมด)</p>
        <PeoplePicker people={pickable} selected={sharedWith} onChange={changeSharedWith} label="หารกับใคร" />
      </section>

      <ItemLines lines={lines} onChange={setLines} onBill={onBill} addLabel="เพิ่มรายการ" />

      <div className="safe-bottom sticky bottom-0 mt-auto border-t border-line bg-bg px-5 pt-3">
        <SplitSummary people={people} mine={sum.mine} shares={sum.shares} total={total} />
        <div className="mb-2">
          <WalletPicker
            wallets={wallets.map((w) => (w.id === entry.walletId ? { ...w, archived: false } : w))}
            value={walletId}
            onChange={setWalletId}
            label="จ่ายจากกระเป๋า"
          />
        </div>
        <button className="btn3d w-full py-4 text-lg" disabled={!sum.valid || save.isPending} onClick={() => save.mutate()}>
          บันทึกการแก้ไข
        </button>
      </div>
    </>
  );
}
