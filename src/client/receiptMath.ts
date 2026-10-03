import { allocateToBillTotal } from "@/domain/allocate";
import { partnerShareOfLines } from "@/domain/split";
import type { Owner } from "./types";

export interface DraftLine {
  key: string;
  rawName: string;
  canonicalName: string;
  qty: number;
  price: number; // satang, as printed
  categoryId: string | null;
  owner: Owner;
  lowConfidence: boolean;
}

export const NEXT_OWNER: Record<Owner, Owner> = { me: "partner", partner: "split", split: "me" };

/** Live "ของเรา / ของแฟน" split for the review screen, with bill-level discount/VAT allocated like the server will. */
export function summarize(lines: DraftLine[], total: number) {
  const printed = lines.reduce((s, l) => s + l.price, 0);
  if (lines.length === 0 || total <= 0 || (printed === 0 && total > 0)) {
    return { mine: 0, partner: 0, printed, mismatch: printed !== total, valid: false };
  }
  const prices = allocateToBillTotal(lines.map((l) => l.price), total);
  const partner = partnerShareOfLines(lines.map((l, i) => ({ price: prices[i], owner: l.owner })));
  return { mine: total - partner, partner, printed, mismatch: printed !== total, valid: true };
}
