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
