import { formatBaht } from "@/domain/money";
import type { PersonDTO, Share } from "./types";

// The first person keeps the old "partner" colour; later ones take the chart series colours.
const COLORS = ["var(--partner)", "var(--series-5)", "var(--series-3)", "var(--series-4)", "var(--series-2)", "var(--series-1)"];

/** Stable per person: based on their place in the full list (archived included), not on who is visible. */
export function personColor(people: PersonDTO[], id: string): string {
  const i = people.findIndex((p) => p.id === id);
  return i < 0 ? "var(--series-other)" : COLORS[i % COLORS.length];
}

export const personName = (people: PersonDTO[], id: string | null) =>
  people.find((p) => p.id === id)?.name ?? "ใครสักคน";

/** "แฟน ฿50 · A ฿30" */
export const describeShares = (people: PersonDTO[], shares: Share[]) =>
  shares.map((s) => `${personName(people, s.personId)} ฿${formatBaht(s.amount)}`).join(" · ");

export const activePeople = (people: PersonDTO[]) => people.filter((p) => !p.archived);
