"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { applyOptimisticEntry } from "@/client/optimistic";
import { bumpCategory, sortByUsage } from "@/client/categoryUsage";
import { activePeople, describeShares } from "@/client/people";
import { useCategories, usePeople, useWallets } from "@/client/queries";
import type { Share, SplitMode } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { bangkokDay } from "@/domain/day";
import { formatBaht, parseBaht } from "@/domain/money";
import { sharesFor, sumShares } from "@/domain/split";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Keypad } from "./Keypad";
import { PeoplePicker, PersonDot } from "./People";
import { WalletPicker } from "./Wallets";

type SplitChoice = "equal" | "theirs" | "custom";
const MESSAGES: Record<string, string> = {
  INVALID_SPLIT: "ส่วนของคนอื่นรวมกันต้องไม่เกินยอดรวม",
  UNKNOWN_PERSON: "ไม่พบคนที่เลือก ลองโหลดหน้าใหม่",
  INVALID_AMOUNT: "ใส่จำนวนเงินก่อนนะ",
  RATE_LIMITED: "ช้าลงหน่อย ลองใหม่อีกที",
  UNKNOWN_WALLET: "ไม่พบกระเป๋าที่เลือก ลองโหลดหน้าใหม่",
};

export function NewEntryScreen() {
  const params = useSearchParams();
  const mode = params.get("mode"); // expense | income | front
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  // null = the default wallet (decided by the server, so a stale list can't send a wrong one)
  const [walletId, setWalletId] = useState<string | null>(null);

  const [kind, setKind] = useState<"expense" | "income">(mode === "income" ? "income" : "expense");
  const [amount, setAmount] = useState("");
  const [fronting, setFronting] = useState(mode === "front");
  const [choice, setChoice] = useState<SplitChoice>("equal");
  // null = untouched: with only one person set up, they are picked for you
  const [picked, setPicked] = useState<string[] | null>(null);
  const active = activePeople(people);
  const withWho = picked ?? (active.length === 1 ? [active[0].id] : []);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  // ?day=YYYY-MM-DD comes from "add to this day" on the calendar; only past days count as backdated (today is a normal entry)
  const dayParam = params.get("day");
  const [day, setDay] = useState(
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam < bangkokDay(new Date()) ? dayParam : "",
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
    if (kind !== "expense" || !fronting || withWho.length === 0) return undefined;
    if (choice === "custom") {
      const shares: Share[] = withWho.map((personId) => {
        try {
          return { personId, amount: custom[personId] ? parseBaht(custom[personId]) : 0 };
        } catch {
          return { personId, amount: 0 };
        }
      });
      return { kind: "custom", shares };
    }
    return { kind: choice, people: withWho };
  };

  // What the preview line shows; null when the split can't be worked out yet (e.g. custom over the total)
  const preview = ((): Share[] | null => {
    const m = split();
    if (!m) return null;
    try {
      return sharesFor(total, m);
    } catch {
      return null;
    }
  })();

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
        walletId: walletId ?? undefined,
      }),
    onMutate: async (categoryId) => {
      // Skip the preview for backdated entries: they may not land in today's numbers
      if (day) return undefined;
      return applyOptimisticEntry(qc, {
        kind, total, categoryId, note: note.trim() || null,
        shares: preview ?? [], walletId,
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

  // Fronting with nobody picked, or a custom split that doesn't fit, can't be saved
  const splitOk = !fronting || kind !== "expense" || (withWho.length > 0 && preview !== null);
  const canSave = total > 0 && splitOk && !save.isPending;

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
        <p className="mt-1 h-5 truncate text-sm text-partner">
          {preview && preview.length > 0 && total > 0 && `ของเรา ฿${formatBaht(total - sumShares(preview))} · ${describeShares(people, preview)}`}
          {fronting && kind === "expense" && total > 0 && preview === null && withWho.length > 0 && (
            <span className="text-expense">ส่วนของคนอื่นรวมกันเกินยอด</span>
          )}
        </p>
      </section>

      {kind === "expense" && (
        <section className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className={`pill flex items-center gap-1 ${fronting ? "on" : ""}`} aria-pressed={fronting} onClick={() => setFronting((v) => !v)}>
              <Icon name="group" size={18} /> ออกก่อน
            </button>
            {fronting &&
              (
                [
                  ["equal", "หารเท่ากัน"],
                  ["theirs", "ของเขาทั้งหมด"],
                  ["custom", "กรอกเอง"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className="pill" aria-pressed={choice === k} onClick={() => setChoice(k)}>
                  {label}
                </button>
              ))}
          </div>
          {fronting && (
            <div className="mt-2">
              <PeoplePicker people={people} selected={withWho} onChange={setPicked} label="ออกก่อนให้ใคร" />
            </div>
          )}
          {fronting && choice === "custom" && (
            <div className="mt-2 flex flex-col gap-2">
              {withWho.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <PersonDot people={people} id={id} />
                  <span className="w-20 truncate">{people.find((p) => p.id === id)?.name}</span>
                  <input
                    inputMode="decimal"
                    placeholder="บาท"
                    value={custom[id] ?? ""}
                    onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value.replace(/[^\d.]/g, "") }))}
                    className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-partner"
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="px-4 pt-3">
        <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} label={kind === "income" ? "เข้ากระเป๋า" : "จ่ายจากกระเป๋า"} />
      </section>

      <section className="px-4 pt-3">
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
            max={bangkokDay(new Date())}
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
