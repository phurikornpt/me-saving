"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { bumpCategory, sortByUsage } from "@/client/categoryUsage";
import { useCategories } from "@/client/queries";
import type { SplitMode } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { partnerShareFor } from "@/domain/split";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Keypad } from "./Keypad";

type PartnerChoice = "split" | "partnerAll" | "custom";
const MESSAGES: Record<string, string> = {
  INVALID_SPLIT: "ส่วนของแฟนต้องไม่เกินยอดรวม",
  INVALID_AMOUNT: "ใส่จำนวนเงินก่อนนะ",
  RATE_LIMITED: "ช้าลงหน่อย ลองใหม่อีกที",
};

export function NewEntryScreen() {
  const params = useSearchParams();
  const mode = params.get("mode"); // expense | income | front
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();

  const [kind, setKind] = useState<"expense" | "income">(mode === "income" ? "income" : "expense");
  const [amount, setAmount] = useState("");
  const [fronting, setFronting] = useState(mode === "front");
  const [choice, setChoice] = useState<PartnerChoice>("split");
  const [customShare, setCustomShare] = useState("");
  const [note, setNote] = useState("");
  // ?day=YYYY-MM-DD comes from "add to this day" on the calendar; ignore anything that isn't a past/today date
  const dayParam = params.get("day");
  const [day, setDay] = useState(
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= new Date().toISOString().slice(0, 10) ? dayParam : "",
  );

  const visible = useMemo(
    () => sortByUsage(categories.filter((c) => c.kind === kind && !c.archived)),
    [categories, kind],
  );

  const total = useMemo(() => {
    try {
      return amount ? parseBaht(amount) : 0;
    } catch {
      return 0;
    }
  }, [amount]);

  const split = (): SplitMode | undefined => {
    if (kind !== "expense" || !fronting) return undefined;
    if (choice === "custom") return { kind: "custom", partnerShare: customShare ? parseBaht(customShare) : 0 };
    return { kind: choice };
  };

  const save = useMutation({
    mutationFn: (categoryId: string) =>
      api.recordEntry({
        kind,
        total,
        categoryId,
        note: note.trim() || null,
        split: split(),
        // a backdated entry still counts for money, never for the streak
        occurredAt: day ? new Date(`${day}T12:00:00+07:00`).toISOString() : undefined,
        source: "manual",
      }),
    onMutate: async (categoryId) => {
      // Skip the preview for backdated entries: they may not land in today's numbers
      if (day) return undefined;
      return applyOptimisticEntry(qc, {
        kind, total, categoryId, note: note.trim() || null,
        partnerShare: partnerShareFor(total, split() ?? { kind: "none" }),
      });
    },
    onSuccess: (out, categoryId) => {
      bumpCategory(categoryId);
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}`,
        action: {
          label: "ย้อนกลับ",
          run: () =>
            void api.deleteEntry(out.entry.id).then(() => {
              void qc.invalidateQueries();
            }),
        },
      });
    },
    onError: (e, categoryId, rollback) => {
      rollback?.();
      fb.toast({
        tone: "error",
        ms: 9000,
        message: MESSAGES[(e as ApiError).code] ?? describeFailure("บันทึกไม่สำเร็จ", e),
        action: { label: "ลองใหม่", run: () => save.mutate(categoryId) },
      });
    },
  });

  const canSave = total > 0 && !save.isPending;
  const share = fronting && choice !== "custom" ? (choice === "split" ? Math.floor(total / 2) : total) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.back()}>
          <Icon name="arrow_back" />
        </button>
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              className="pill"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                if (k === "income") setFronting(false);
              }}
            >
              {k === "expense" ? "รายจ่าย" : "รายรับ"}
            </button>
          ))}
        </div>
      </header>

      <section className="px-6 pt-4 text-center">
        <div className={`font-bold text-6xl ${kind === "income" ? "text-income" : "text-ink"}`} aria-live="polite">
          <span className="text-3xl text-ink-3">฿ </span>
          {amount || "0"}
        </div>
        {/* always occupies its line so the keypad below never jumps while typing */}
        <p className="mt-1 h-5 text-sm text-partner">
          {share !== null && total > 0 && `ของเรา ฿${formatBaht(total - share)} · แฟนติด ฿${formatBaht(share)}`}
        </p>
      </section>

      {kind === "expense" && (
        <section className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className={`pill flex items-center gap-1 ${fronting ? "on" : ""}`} aria-pressed={fronting} onClick={() => setFronting((v) => !v)}>
              <Icon name="group" size={18} /> ออกก่อนแฟน
            </button>
            {fronting &&
              (
                [
                  ["split", "หาร"],
                  ["partnerAll", "ของแฟนทั้งหมด"],
                  ["custom", "กรอกเอง"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className="pill" aria-pressed={choice === k} onClick={() => setChoice(k)}>
                  {label}
                </button>
              ))}
          </div>
          {fronting && choice === "custom" && (
            <input
              inputMode="decimal"
              placeholder="ส่วนของแฟน (บาท)"
              value={customShare}
              onChange={(e) => setCustomShare(e.target.value.replace(/[^\d.]/g, ""))}
              className="mt-2 w-full rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-partner"
            />
          )}
        </section>
      )}

      <section className="px-4 pt-4">
        <p className="mb-2 text-sm text-ink-3">แตะหมวดเพื่อบันทึก</p>
        <div className="grid grid-cols-4 gap-2">
          {visible.map((c) => (
            <button
              key={c.id}
              disabled={!canSave}
              onClick={() => {
                // leave right away: the dashboard already shows the new entry as pending
                save.mutate(c.id);
                router.replace("/");
              }}
              className="flex flex-col items-center gap-1 rounded-2xl bg-card px-1 py-3 text-xs shadow-[0_3px_0_var(--line)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40"
            >
              <Icon name={c.icon} size={28} className={kind === "income" ? "text-income" : "text-ink"} />
              <span className="line-clamp-1">{c.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex items-center gap-2 px-4 pt-3">
        <input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder="โน้ต (ไม่ใส่ก็ได้)"
          className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <label className="pill flex items-center gap-1 text-sm">
          <Icon name="calendar_month" size={18} />
          <input
            type="date"
            value={day}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDay(e.target.value)}
            className="w-[7.5rem] bg-transparent text-xs outline-none"
            aria-label="วันที่ (ค่าเริ่มต้นคือวันนี้)"
          />
        </label>
      </section>
      {day && <p className="px-6 pt-1 text-xs text-ink-3">จดย้อนหลัง: เงินถูกบันทึกในวันนั้น แต่ไม่ช่วยต่อ streak</p>}

      <div className="safe-bottom mt-auto pt-4">
        <Keypad value={amount} onChange={setAmount} />
      </div>
    </main>
  );
}
