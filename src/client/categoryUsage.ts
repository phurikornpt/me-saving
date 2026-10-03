// Per-device convenience: remembers which categories are used most so they float to the front
// (FR-1). Losing it just resets the order, so localStorage is fine.
const KEY = "me-budget-category-use";

function read(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function bumpCategory(id: string) {
  try {
    const c = read();
    c[id] = (c[id] ?? 0) + 1;
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode etc.: ordering just stays default */
  }
}

export function sortByUsage<T extends { id: string }>(items: T[]): T[] {
  if (typeof window === "undefined") return items;
  const c = read();
  return [...items].sort((a, b) => (c[b.id] ?? 0) - (c[a.id] ?? 0)); // stable: ties keep the server order
}
