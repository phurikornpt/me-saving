import { DomainError } from "./errors";
import { assertSatang, type Satang } from "./money";

/**
 * Spread bill-level discount / VAT over line prices proportionally so the lines
 * add up to `billTotal` to the satang. Rounding leftovers go to the priciest line.
 */
export function allocateToBillTotal(grossPrices: Satang[], billTotal: Satang): Satang[] {
  assertSatang(billTotal);
  grossPrices.forEach(assertSatang);
  const gross = grossPrices.reduce((a, b) => a + b, 0);
  if (grossPrices.length === 0) {
    if (billTotal === 0) return [];
    throw new DomainError("RECEIPT_TOTAL_MISMATCH", "no lines to allocate to");
  }
  if (gross === 0) {
    if (billTotal === 0) return grossPrices.map(() => 0);
    throw new DomainError("RECEIPT_TOTAL_MISMATCH", "lines sum to zero");
  }

  const allocated = grossPrices.map((p) => Math.floor((p * billTotal) / gross));
  const leftover = billTotal - allocated.reduce((a, b) => a + b, 0);
  if (leftover !== 0) {
    let biggest = 0;
    grossPrices.forEach((p, i) => {
      if (p > grossPrices[biggest]) biggest = i;
    });
    allocated[biggest] += leftover;
  }
  return allocated;
}
