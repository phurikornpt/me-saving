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
