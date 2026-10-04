/** When a group was paid, for the API: only a day before today is sent (as noon in Bangkok); today or none = right now. */
export function occurredAtFor(day: string | null | undefined, today: string): string | undefined {
  return day && day < today ? new Date(`${day}T12:00:00+07:00`).toISOString() : undefined;
}

/** The day a scan read off the receipt, if it makes sense as a payment day (not in the future). */
export function usableScanDay(day: string | null | undefined, today: string): string {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : "";
}
