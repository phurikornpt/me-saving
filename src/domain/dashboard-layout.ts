export const WIDGET_IDS = ["streak", "partner", "presets", "today", "calendar", "recent"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface LayoutItem {
  id: WidgetId;
  enabled: boolean;
}

/** First-run order from the TOR: Streak & Level, partner balance, presets, calendar, recent. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "streak", enabled: true },
  { id: "partner", enabled: true },
  { id: "presets", enabled: true },
  { id: "today", enabled: false },
  { id: "calendar", enabled: true },
  { id: "recent", enabled: true },
];

/**
 * Makes any stored value safe to render: unknown ids and duplicates are dropped, the
 * user's order is kept, and widgets added in later versions are appended (enabled).
 */
export function normalizeLayout(raw: unknown): LayoutItem[] {
  const known = new Set<string>(WIDGET_IDS);
  const seen = new Set<string>();
  const result: LayoutItem[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ id: id as WidgetId, enabled: (item as { enabled?: unknown }).enabled !== false });
    }
  }
  if (result.length === 0) return DEFAULT_LAYOUT.map((i) => ({ ...i }));
  for (const id of WIDGET_IDS) if (!seen.has(id)) result.push({ id, enabled: true });
  return result;
}
