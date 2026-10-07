"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  BACK_DAYS,
  isFuture,
  MINUTE_STEP,
  priceChoices,
  quickWhen,
  wallClock,
  whenLabel,
  type AtChoice,
  type WhenChoice,
} from "@/client/presetChoices";
import { usePresetPrices } from "@/client/queries";
import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "../Icon";
import { WhenWheels } from "../WhenField";
import { WheelPicker } from "../WheelPicker";

type Preset = DashboardDTO["presets"][number];

/** What a finger dragged out of the chip is doing over the picker. */
export interface DragTarget {
  move: (x: number, y: number) => void;
  drop: (x: number, y: number) => void;
}

const WIDTH = 366;
const QUICK = [
  { id: "now", label: "ตอนนี้" },
  { id: "hourAgo", label: "1 ชม.ก่อน" },
  { id: "yesterday", label: "เมื่อวาน" },
] as const;

const glass =
  "border border-white/20 bg-[rgba(28,28,32,.55)] text-white shadow-[0_24px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.25)] backdrop-blur-2xl backdrop-saturate-150";
const tile = "border border-white/15 bg-white/10";
const tileOn = "border-white bg-white text-black shadow-[0_0_0_3px_rgba(41,204,87,.9)]";

/**
 * Held preset chip → this frosted picker springs out of it: the prices it was actually paid at
 * (tap or release on one to log it), when it was paid, and "ราคาอื่น…" / "กำหนดเอง…" which turn the
 * same panel into a price strip or a day/hour/minute wheel.
 */
export function PresetPopover({
  preset,
  anchor,
  dragRef,
  onLog,
  onClose,
}: {
  preset: Preset;
  /** The chip it opened from, in viewport coordinates. */
  anchor: DOMRect;
  dragRef: RefObject<DragTarget | null>;
  onLog: (amount: number, when: WhenChoice) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const now = useMemo(() => new Date(), []);
  const { data: history = [] } = usePresetPrices(preset.id);
  const prices = useMemo(() => priceChoices(preset.amount, history), [preset.amount, history]);
  const [panel, setPanel] = useState<"main" | "price" | "time">("main");
  const [when, setWhen] = useState<WhenChoice>({ kind: "now" });
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // where it sits: above the chip when there's room, else below; never off screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - 24);
  const left = Math.max(12, Math.min(anchor.left - 16, vw - width - 12));
  const above = anchor.top > vh * 0.45;
  const place = above ? { bottom: vh - anchor.top + 10 } : { top: anchor.bottom + 10 };
  const origin = `${anchor.left + anchor.width / 2 - left}px ${above ? "100%" : "0%"}`;

  const act = (key: string) => {
    const [kind, value] = key.split(":");
    if (kind === "price") onLog(Number(value), when);
    else if (kind === "when") setWhen(quickWhen(value as (typeof QUICK)[number]["id"], new Date()));
    else if (kind === "more") setPanel("price");
    else if (kind === "custom") setPanel("time");
  };

  // a finger still down from the hold: highlight what it's over, act on what it's released over
  useEffect(() => {
    const under = (x: number, y: number) =>
      panel === "main" ? (document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null) : null;
    dragRef.current = {
      move: (x, y) => setHover(under(x, y)),
      drop: (x, y) => {
        const key = under(x, y);
        setHover(null);
        if (key) act(key); // released anywhere else: stay open for taps
      },
    };
    return () => {
      dragRef.current = null;
    };
  });

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-40 select-none bg-black/30 backdrop-blur-[2px]"
        style={{ WebkitTouchCallout: "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`${preset.label}: เลือกราคาและเวลา`}
        tabIndex={-1}
        // it opens under a finger still held from the chip: without this the browser's own long-press
        // selects the text under it and shows the copy menu
        className={`fixed z-50 select-none rounded-[28px] p-4 outline-none ${glass}`}
        style={{ left, width, transformOrigin: origin, WebkitTouchCallout: "none", ...place }}
        onContextMenu={(e) => e.preventDefault()}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.55 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 30 }}
      >
        {panel === "main" && (
          <Main
            preset={preset}
            prices={prices}
            when={when}
            now={now}
            hover={hover}
            reduce={!!reduce}
            onAct={act}
          />
        )}
        {panel === "price" && (
          <PricePanel
            preset={preset}
            start={prices[0]?.amount ?? preset.amount}
            paid={prices}
            whenText={whenLabel(when, now)}
            onBack={() => setPanel("main")}
            onLog={(amount) => onLog(amount, when)}
          />
        )}
        {panel === "time" && (
          <TimePanel
            preset={preset}
            initial={when}
            onBack={() => setPanel("main")}
            onDone={(w) => {
              setWhen(w);
              setPanel("main");
            }}
          />
        )}
      </motion.div>
    </>,
    document.body,
  );
}

function Header({ preset, onBack, title, aside }: { preset: Preset; onBack?: () => void; title?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {onBack ? (
        <button aria-label="กลับ" onClick={onBack} className="-ml-1 rounded-full p-1">
          <Icon name="arrow_back" size={22} />
        </button>
      ) : (
        <Icon name={preset.icon} size={22} />
      )}
      <span className="font-display min-w-0 flex-1 truncate text-lg">{title ?? preset.label}</span>
      {aside}
    </div>
  );
}

function Main({
  preset,
  prices,
  when,
  now,
  hover,
  reduce,
  onAct,
}: {
  preset: Preset;
  prices: ReturnType<typeof priceChoices>;
  when: WhenChoice;
  now: Date;
  hover: string | null;
  reduce: boolean;
  onAct: (key: string) => void;
}) {
  const maxCount = Math.max(1, ...prices.map((p) => p.count));
  const whenKey = when.kind === "now" ? "when:now" : null;
  return (
    <>
      <Header preset={preset} aside={<span className="text-xs text-white/55">ลากไปปล่อย หรือแตะ</span>} />
      <div className="mb-3 flex gap-1.5" role="group" aria-label="จ่ายเมื่อไหร่">
        {QUICK.map((q) => {
          const key = `when:${q.id}`;
          const on = key === whenKey;
          return (
            <button
              key={q.id}
              data-drop={key}
              aria-pressed={on}
              onClick={() => onAct(key)}
              className={`h-10 shrink-0 rounded-full px-3 text-[13px] transition-transform ${on ? "bg-white text-black" : tile} ${hover === key ? "scale-105 border-white" : ""}`}
            >
              {q.label}
            </button>
          );
        })}
        <button
          data-drop="custom"
          aria-pressed={when.kind === "at"}
          onClick={() => onAct("custom")}
          className={`h-10 min-w-0 flex-1 truncate rounded-full px-3 text-[13px] transition-transform ${when.kind === "at" ? "bg-white text-black" : tile} ${hover === "custom" ? "scale-105 border-white" : ""}`}
        >
          {when.kind === "at" ? whenLabel(when, now) : "กำหนดเอง…"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {prices.map((p, i) => {
          const key = `price:${p.amount}`;
          const on = hover === key;
          return (
            <motion.button
              key={p.amount}
              data-drop={key}
              onClick={() => onAct(key)}
              initial={reduce ? false : { opacity: 0, scale: 0.6, y: 16 }}
              animate={{ opacity: 1, scale: on ? 1.08 : 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26, delay: reduce ? 0 : 0.06 + i * 0.04 }}
              className={`flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-[20px] ${on ? tileOn : tile}`}
            >
              <span className="text-[22px] font-semibold leading-none">฿{formatBaht(p.amount)}</span>
              <span className="text-[11px] opacity-65">{p.note}</span>
              {p.count > 0 && (
                <span className="mt-0.5 h-1 w-11 overflow-hidden rounded-full bg-current/15">
                  <span className="block h-full rounded-full bg-[#29cc57]" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                </span>
              )}
            </motion.button>
          );
        })}
        <motion.button
          data-drop="more"
          onClick={() => onAct("more")}
          initial={reduce ? false : { opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: hover === "more" ? 1.05 : 1, y: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 26, delay: reduce ? 0 : 0.06 + prices.length * 0.04 }}
          className={`flex h-[72px] items-center justify-center gap-1 rounded-[20px] border border-dashed border-white/40 text-sm ${
            prices.length % 3 === 2 ? "" : prices.length % 3 === 1 ? "col-span-2" : "col-span-3"
          } ${hover === "more" ? "bg-white/25" : "bg-white/5"}`}
        >
          <Icon name="unfold_more" size={20} /> ราคาอื่น…
        </motion.button>
      </div>
    </>
  );
}

/** What one notch of the price wheel adds: +1 to +100, one more per notch of the sideways strip. */
const STEPS = Array.from({ length: 100 }, (_, i) => i + 1);
const stepMax = (step: number) => Math.max(500, step * 30);

/**
 * "ราคาอื่น…": a wheel scrolled up and down picks the price; a sideways strip under it picks how
 * much each notch adds (+1 to start; scroll across and it goes +2, +3 ... up to +100).
 */
function PricePanel({
  preset,
  start,
  paid,
  whenText,
  onBack,
  onLog,
}: {
  preset: Preset;
  start: number;
  paid: ReturnType<typeof priceChoices>;
  whenText: string;
  onBack: () => void;
  onLog: (amount: number) => void;
}) {
  const [step, setStep] = useState<number>(1);
  const [baht, setBaht] = useState(() => Math.min(stepMax(1), Math.max(1, Math.round(start / 100))));
  const counts = useMemo(() => new Map(paid.filter((p) => p.count > 0).map((p) => [p.amount / 100, p.count])), [paid]);
  const values = useMemo(() => Array.from({ length: Math.floor(stepMax(step) / step) }, (_, i) => (i + 1) * step), [step]);
  const items = useMemo(
    () => values.map((v) => ({ key: String(v), label: `฿${v.toLocaleString("th-TH")}`, note: counts.has(v) ? `${counts.get(v)}×` : undefined })),
    [values, counts],
  );
  const index = Math.max(0, values.indexOf(baht));
  const changeStep = (st: number) => {
    // the price in the middle moves to the nearest multiple of the new step, so it never jumps far
    const next = Math.min(stepMax(st), Math.max(st, Math.round(baht / st) * st));
    setStep(st);
    setBaht(next);
  };
  return (
    <>
      <Header preset={preset} onBack={onBack} title={`${preset.label} · ราคาอื่น`} aside={<span className="text-xs text-white/55">เลื่อนทีละ ฿{step}</span>} />
      <WheelPicker
        key={step}
        size={44}
        items={items}
        index={index}
        onChange={(i) => setBaht(values[i])}
        label={`ราคา เลื่อนขึ้นลง ทีละ ${step} บาท`}
        className="mb-1"
      />
      <p className="mb-1 mt-2 text-center text-xs text-white/55">ปัดซ้าย-ขวา เพื่อเปลี่ยนว่าเลื่อนทีละเท่าไหร่</p>
      <WheelPicker
        axis="x"
        size={68}
        cross={40}
        items={STEPS.map((st) => ({ key: String(st), label: `+${st}` }))}
        index={step - 1}
        onChange={(i) => changeStep(STEPS[i])}
        label="เลื่อนทีละกี่บาท"
        className="mb-4"
      />
      <button onClick={() => onLog(baht * 100)} className="btn3d w-full py-3.5 text-base">
        <Icon name="check" size={22} /> จด ฿{baht.toLocaleString("th-TH")} · {whenText}
      </button>
    </>
  );
}

/** "กำหนดเอง…": day / hour / minute wheels, today back BACK_DAYS days; later than now is struck out. */
function TimePanel({
  preset,
  initial,
  onBack,
  onDone,
}: {
  preset: Preset;
  initial: WhenChoice;
  onBack: () => void;
  onDone: (w: WhenChoice) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const [choice, setChoice] = useState<AtChoice>(initial.kind === "at" ? initial : { kind: "at", ...wallClock(now) });
  const future = isFuture(choice, now);

  return (
    <>
      <Header preset={preset} onBack={onBack} title={`${preset.label} · เวลา`} aside={<span className="text-xs text-white/55">ย้อนหลังได้ {BACK_DAYS} วัน</span>} />
      <div className="mb-1">
        <WhenWheels value={choice} now={now} onChange={setChoice} />
      </div>
      <p className={`mb-3 text-center text-xs ${future ? "text-[#ff7a59]" : "text-white/55"}`} role={future ? "alert" : undefined}>
        {future ? "เวลานี้ยังมาไม่ถึง เลื่อนย้อนกลับ" : `นาทีทีละ ${MINUTE_STEP}`}
      </p>
      <button
        disabled={future}
        onClick={() => onDone(choice)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 font-medium text-black disabled:opacity-40"
      >
        <Icon name="check" size={20} /> ใช้เวลานี้
      </button>
    </>
  );
}
