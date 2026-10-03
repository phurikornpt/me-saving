"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { describeShares } from "@/client/people";
import { useCategories, usePeople } from "@/client/queries";
import type { EntryDTO } from "@/client/types";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";
import { PeoplePicker } from "./People";
import { Sheet } from "./Sheet";

const ERRORS: Record<string, string> = {
  BALANCE_WOULD_GO_NEGATIVE: "แก้ไม่ได้: มีคนจ่ายคืนไปแล้วมากกว่ายอดที่จะค้างหลังแก้",
  ENTRY_LOCKED: "ใบเสร็จแก้ยอดไม่ได้ (แก้โน้ตได้)",
  INVALID_SPLIT: "ส่วนของคนอื่นต้องไม่เกินยอดรวม",
};

type Choice = "keep" | "none" | "equal" | "theirs";

/** Edit or delete one entry. Receipt entries keep their amount/split (they come from the lines). */
export function EditEntrySheet({ entry, onClose }: { entry: EntryDTO | null; onClose: () => void }) {
  // key => the form state is rebuilt from the entry whenever a different one is opened
  return entry ? <EditForm key={entry.id} entry={entry} onClose={onClose} /> : null;
}

function EditForm({ entry, onClose }: { entry: EntryDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const [amount, setAmount] = useState(formatBaht(entry.total).replace(/,/g, ""));
  const [note, setNote] = useState(entry.note ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(entry.categoryId);
  const [split, setSplit] = useState<Choice>("keep");
  const [withWho, setWithWho] = useState<string[]>(entry.shares.map((s) => s.personId));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // group entries (receipt / hand-typed) get amount and split from their lines
  const locked = entry.source === "receipt" || entry.source === "itemized";
  const refresh = () => void qc.invalidateQueries();
  const onError = (e: unknown) => fb.toast({ tone: "error", message: ERRORS[(e as ApiError).code] ?? "ไม่สำเร็จ ลองอีกครั้ง" });

  const save = useMutation({
    mutationFn: () => {
      const patch: Parameters<typeof api.updateEntry>[1] = { note: note.trim() || null };
      if (entry.kind !== "repayment") patch.categoryId = categoryId;
      if (!locked) {
        const total = parseBaht(amount);
        if (total !== entry.total) patch.total = total;
        if (split === "none") patch.split = { kind: "none" };
        else if (split !== "keep") patch.split = { kind: split, people: withWho };
      }
      return api.updateEntry(entry.id, patch);
    },
    onSuccess: () => {
      refresh();
      fb.toast({ message: "แก้ไขแล้ว" });
      onClose();
    },
    onError,
  });

  const del = useMutation({
    mutationFn: () => api.deleteEntry(entry.id),
    onSuccess: () => {
      refresh();
      fb.toast({ message: "ลบแล้ว" });
      onClose();
    },
    onError,
  });

  const cats = categories.filter((c) => c.kind === (entry.kind === "income" ? "income" : "expense") && !c.archived);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="แก้ไขรายการ">
      <div className="flex flex-col gap-3">
        <label className="text-sm text-ink-3">
          จำนวนเงิน (บาท)
          <input
            inputMode="decimal"
            value={amount}
            disabled={locked}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="mt-1 w-full rounded-full border-2 border-line bg-card px-4 py-2 text-lg text-ink outline-none focus:border-ink disabled:opacity-50"
          />
        </label>
        {locked && <p className="text-xs text-ink-3">รายการแบบกลุ่มแก้ยอดและการหารไม่ได้ เพราะมาจากรายการย่อยข้างใน</p>}

        {entry.shares.length > 0 && <p className="text-xs text-partner">ตอนนี้: {describeShares(people, entry.shares)}</p>}
        {entry.kind === "expense" && !locked && (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["keep", "การหารเดิม"],
                  ["none", "ของเราทั้งหมด"],
                  ["equal", "หารเท่ากัน"],
                  ["theirs", "ของเขาทั้งหมด"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className="pill text-sm" aria-pressed={split === k} onClick={() => setSplit(k)}>
                  {label}
                </button>
              ))}
            </div>
            {(split === "equal" || split === "theirs") && (
              <PeoplePicker people={people} selected={withWho} onChange={setWithWho} label="กับใคร" />
            )}
          </>
        )}

        {entry.kind !== "repayment" && (
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c.id} className="pill flex items-center gap-1 text-sm" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <Icon name={c.icon} size={16} /> {c.name}
              </button>
            ))}
          </div>
        )}

        <input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder="โน้ต"
          className="rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink"
        />

        <div className="mt-2 flex gap-3">
          <button
            className="btn3d key flex-1"
            style={{ ["--fg" as string]: "var(--expense)" }}
            disabled={del.isPending}
            onClick={() => (confirmDelete ? del.mutate() : setConfirmDelete(true))}
          >
            <Icon name="delete" size={20} /> {confirmDelete ? "กดอีกครั้งเพื่อลบ" : "ลบ"}
          </button>
          <button
            className="btn3d flex-1"
            disabled={save.isPending || ((split === "equal" || split === "theirs") && withWho.length === 0)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Spinner /> : "บันทึก"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
