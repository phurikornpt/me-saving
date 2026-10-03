/** A calendar day in Asia/Bangkok as "YYYY-MM-DD". Thailand has no DST, so UTC+7 is fixed. */
export type DayKey = string;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function bangkokDay(instant: Date): DayKey {
  return new Date(instant.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: DayKey, n: number): DayKey {
  const t = Date.parse(`${day}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** [start, end) instants of a Bangkok calendar day, for range queries on timestamptz columns. */
export function bangkokDayRange(day: DayKey): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - BANGKOK_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** "2026-10" -> every day of that month plus the first day of the next. */
export function monthDays(month: string): { days: DayKey[]; nextMonthStart: DayKey } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`bad month: ${month}`);
  const first = `${month}-01`;
  const d = new Date(`${first}T00:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const days: DayKey[] = [];
  for (let cur = first; cur < next; cur = addDays(cur, 1)) days.push(cur);
  return { days, nextMonthStart: next };
}
