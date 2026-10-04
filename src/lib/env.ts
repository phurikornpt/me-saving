/**
 * Env values pasted into dashboards often arrive with a trailing newline, spaces or wrapping quotes.
 * Normalise them so a copy/paste slip can't silently break login.
 */
export function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
  return unquoted === "" ? undefined : unquoted;
}

/** Default AI calls per account per 24 h, shared by every AI feature. */
export const DEFAULT_AI_DAILY_LIMIT = 20;

/**
 * Daily AI budget per account from the env. Unset or garbage = the default; `0` = no limit
 * (calls are still counted). `legacy` is the old receipt-only variable, read when the new one is unset.
 */
export function aiDailyLimit(value: string | undefined, legacy?: string): number | null {
  const raw = cleanEnv(value) ?? cleanEnv(legacy);
  if (raw === undefined) return DEFAULT_AI_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return DEFAULT_AI_DAILY_LIMIT;
  return n === 0 ? null : n;
}
