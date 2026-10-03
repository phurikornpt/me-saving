import { allocateToBillTotal } from "@/domain/allocate";
import { ME_ONLY, sharesOfLines, sumShares } from "@/domain/split";
import type { LineOwners, Share } from "./types";

export interface DraftLine {
  key: string;
  rawName: string;
  canonicalName: string;
  qty: number;
  price: number; // satang, as printed
  categoryId: string | null;
  owners: LineOwners;
  lowConfidence: boolean;
}

/**
 * Tapping a line's chip on a bill shared with ONE person cycles เรา -> them -> หาร -> เรา.
 * With more people there are too many combinations to cycle through, so the UI opens a picker instead.
 */
export function nextOwners(o: LineOwners, personId: string): LineOwners {
  if (o.me && o.people.length === 0) return { me: false, people: [personId] };
  if (!o.me && o.people.length === 1 && o.people[0] === personId) return { me: true, people: [personId] };
  return ME_ONLY;
}

/** Live "ของเรา / ของแต่ละคน" for the review screen, with bill-level discount/VAT allocated like the server will. */
export function summarize(lines: DraftLine[], total: number): {
  mine: number; shares: Share[]; others: number; printed: number; mismatch: boolean; valid: boolean;
} {
  const printed = lines.reduce((s, l) => s + l.price, 0);
  if (lines.length === 0 || total <= 0 || (printed === 0 && total > 0)) {
    return { mine: 0, shares: [], others: 0, printed, mismatch: printed !== total, valid: false };
  }
  const prices = allocateToBillTotal(lines.map((l) => l.price), total);
  const shares = sharesOfLines(lines.map((l, i) => ({ price: prices[i], owners: l.owners })));
  const others = sumShares(shares);
  return { mine: total - others, shares, others, printed, mismatch: printed !== total, valid: true };
}
