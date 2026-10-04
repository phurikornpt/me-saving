import { addDays, bangkokDay, type DayKey } from "@/domain/day";
import type { PresetPriceDTO } from "./types";

/** How far back a preset can be logged from its popup. */
export const BACK_DAYS = 14;
export const MINUTE_STEP = 5;

export interface PriceChoice {
  amount: number;
  /** Shown under the price: "ล่าสุด · 5×", "เริ่มต้น", ... */
  note: string;
  /** How often it was paid, for the little frequency bar (0 = never). */
  count: number;
}

/**
 * The price tiles: the prices actually paid (most used first), with the preset's own price always
 * there even if it was never paid. At most `max`.
 */
export function priceChoices(presetAmount: number, history: PresetPriceDTO[], max = 4): PriceChoice[] {
  const latest = history.reduce<PresetPriceDTO | null>((a, p) => (!a || p.lastAt > a.lastAt ? p : a), null);
  const out: PriceChoice[] = history.map((p) => ({ amount: p.amount, count: p.count, note: "" }));
  if (!out.some((c) => c.amount === presetAmount)) out.push({ amount: presetAmount, count: 0, note: "" });
  // keep the preset's own price even when four others were used more
  const kept = out.slice(0, max);
  if (!kept.some((c) => c.amount === presetAmount)) kept[max - 1] = out.find((c) => c.amount === presetAmount)!;
  return kept.map((c) => ({
    ...c,
    note: [latest?.amount === c.amount && "ล่าสุด", c.amount === presetAmount && "เริ่มต้น", c.count > 0 && `${c.count}×`]
      .filter(Boolean)
      .join(" · "),
  }));
}

/** When it was paid: right now, or a Bangkok day + hour + minute. */
export type WhenChoice = { kind: "now" } | { kind: "at"; day: DayKey; hour: number; minute: number };

/** The instant to send, or undefined for "now" (the server stamps it). */
export function occurredAtOf(w: WhenChoice): string | undefined {
  if (w.kind === "now") return undefined;
  const hh = String(w.hour).padStart(2, "0");
  const mm = String(w.minute).padStart(2, "0");
  return new Date(`${w.day}T${hh}:${mm}:00+07:00`).toISOString();
}

export const isFuture = (w: WhenChoice, now: Date) => w.kind === "at" && new Date(occurredAtOf(w)!) > now;
export const isBackdated = (w: WhenChoice, now: Date) => w.kind === "at" && w.day < bangkokDay(now);

/** The Bangkok wall clock of an instant, minutes rounded down to the step. */
export function wallClock(now: Date): { day: DayKey; hour: number; minute: number } {
  const t = new Date(now.getTime() + 7 * 3600_000);
  return { day: bangkokDay(now), hour: t.getUTCHours(), minute: Math.floor(t.getUTCMinutes() / MINUTE_STEP) * MINUTE_STEP };
}

/** The quick time chips. */
export function quickWhen(id: "now" | "hourAgo" | "yesterday", now: Date): WhenChoice {
  if (id === "now") return { kind: "now" };
  if (id === "hourAgo") return { kind: "at", ...wallClock(new Date(now.getTime() - 3600_000)) };
  const c = wallClock(now);
  return { kind: "at", ...c, day: addDays(c.day, -1) };
}

/** The days the wheel offers, today first. `from` reaches back further when something already sits on an older day. */
export function pickableDays(now: Date, from?: DayKey): DayKey[] {
  const today = bangkokDay(now);
  let back = BACK_DAYS;
  if (from && from < today) while (back < 800 && addDays(today, -back) > from) back++;
  return Array.from({ length: back + 1 }, (_, i) => addDays(today, -i));
}

export type AtChoice = Extract<WhenChoice, { kind: "at" }>;

/** An instant as a choice, minute kept exact (so an untouched entry keeps its time). */
export function whenOfInstant(d: Date): AtChoice {
  const t = new Date(d.getTime() + 7 * 3600_000);
  return { kind: "at", day: bangkokDay(d), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

/** A day with no time of its own: noon Bangkok keeps it on that day. Today (or later) means "now". */
export const whenOfDay = (day: DayKey | null | undefined, today: DayKey): WhenChoice =>
  day && day < today ? { kind: "at", day, hour: 12, minute: 0 } : { kind: "now" };

export const sameWhen = (a: WhenChoice, b: WhenChoice): boolean =>
  a.kind === "now" ? b.kind === "now" : b.kind === "at" && a.day === b.day && a.hour === b.hour && a.minute === b.minute;

const WEEKDAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function dayLabel(day: DayKey, now: Date): string {
  const today = bangkokDay(now);
  if (day === today) return "วันนี้";
  if (day === addDays(today, -1)) return "เมื่อวาน";
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export function whenLabel(w: WhenChoice, now: Date): string {
  if (w.kind === "now") return "ตอนนี้";
  return `${dayLabel(w.day, now)} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}
