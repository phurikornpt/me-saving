"use client";

import { useState } from "react";
import {
  dayLabel,
  isFuture,
  MINUTE_STEP,
  pickableDays,
  quickWhen,
  wallClock,
  whenLabel,
  type AtChoice,
  type WhenChoice,
} from "@/client/presetChoices";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { WheelPicker } from "./WheelPicker";

/** Day / hour / minute wheels: today back as far as `value` needs; later than now is struck out. */
export function WhenWheels({ value, now, onChange }: { value: AtChoice; now: Date; onChange: (w: AtChoice) => void }) {
  // fixed on first render: the list must not shift under the finger while the day wheel scrolls
  const [days] = useState(() => pickableDays(now, value.day));
  const nowClock = wallClock(now);
  const today = value.day === days[0];
  return (
    <div className="flex gap-1">
      <WheelPicker
        className="flex-[1.6]"
        label="วัน"
        items={days.map((d) => ({ key: d, label: dayLabel(d, now) }))}
        index={Math.max(0, days.indexOf(value.day))}
        onChange={(i) => onChange({ ...value, day: days[i] })}
      />
      <WheelPicker
        className="flex-1"
        label="ชั่วโมง"
        items={Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: String(h).padStart(2, "0"), disabled: today && h > nowClock.hour }))}
        index={value.hour}
        onChange={(hour) => onChange({ ...value, hour })}
      />
      <WheelPicker
        className="flex-1"
        label="นาที"
        items={Array.from({ length: 60 / MINUTE_STEP }, (_, m) => ({ key: String(m), label: String(m * MINUTE_STEP).padStart(2, "0") }))}
        index={Math.floor(value.minute / MINUTE_STEP)}
        onChange={(m) => onChange({ ...value, minute: m * MINUTE_STEP })}
      />
    </div>
  );
}

const QUICK = [
  { id: "now", label: "ตอนนี้" },
  { id: "hourAgo", label: "1 ชม.ก่อน" },
  { id: "yesterday", label: "เมื่อวาน" },
] as const;

/**
 * The one way to say when something was paid, on every screen that adds or edits an entry: a pill
 * showing "ตอนนี้" / "เมื่อวาน 14:30" that opens a sheet with quick choices and the day / hour / minute wheels.
 */
export function WhenField({ value, onChange, className = "" }: { value: WhenChoice; onChange: (w: WhenChoice) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<WhenChoice>(value);
  const at: AtChoice = draft.kind === "at" ? draft : { kind: "at", ...wallClock(now) };
  const future = isFuture(draft, now);

  return (
    <>
      <button
        type="button"
        aria-label="วันและเวลา"
        aria-pressed={value.kind === "at"}
        className={`pill flex items-center gap-1 text-sm ${className}`}
        onClick={() => {
          setNow(new Date());
          setDraft(value);
          setOpen(true);
        }}
      >
        <Icon name="calendar_month" size={18} />
        {whenLabel(value, new Date())}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="วันและเวลา">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2" role="group" aria-label="เลือกเร็ว">
            {QUICK.map((q) => (
              <button key={q.id} type="button" className="pill" aria-pressed={q.id === "now" && draft.kind === "now"} onClick={() => setDraft(quickWhen(q.id, new Date()))}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="scope-night rounded-3xl bg-bg p-3 text-ink">
            <WhenWheels value={at} now={now} onChange={setDraft} />
            <p className={`mt-2 text-center text-xs ${future ? "text-expense" : "text-ink-3"}`} role={future ? "alert" : undefined}>
              {future ? "เวลานี้ยังมาไม่ถึง เลื่อนย้อนกลับ" : draft.kind === "now" ? "ใช้เวลาตอนกดบันทึก" : `นาทีทีละ ${MINUTE_STEP}`}
            </p>
          </div>
          <button
            type="button"
            className="btn3d w-full py-3.5 text-base"
            disabled={future}
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            <Icon name="check" size={20} /> ใช้เวลานี้
          </button>
        </div>
      </Sheet>
    </>
  );
}
