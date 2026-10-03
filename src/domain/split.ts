import { DomainError } from "./errors";
import { assertSatang, type Satang } from "./money";

export type Owner = "me" | "partner" | "split";

export type SplitMode =
  | { kind: "none" }
  | { kind: "split" }
  | { kind: "partnerAll" }
  | { kind: "custom"; partnerShare: Satang };

/**
 * The partner's part of a fronted expense. For an odd satang under "split" the
 * leftover stays with us, so the partner is never charged more than half.
 */
export function partnerShareFor(total: Satang, mode: SplitMode): Satang {
  assertSatang(total);
  switch (mode.kind) {
    case "none":
      return 0;
    case "split":
      return Math.floor(total / 2);
    case "partnerAll":
      return total;
    case "custom":
      assertSatang(mode.partnerShare);
      if (mode.partnerShare > total) {
        throw new DomainError("INVALID_SPLIT", "partner share exceeds total");
      }
      return mode.partnerShare;
  }
}

export const myShareOf = (total: Satang, partnerShare: Satang): Satang =>
  total - partnerShare;

export interface OwnedLine {
  price: Satang;
  owner: Owner;
}

/** Roll receipt lines up into the entry's partner share. "split" lines halve (odd satang stays ours). */
export function partnerShareOfLines(lines: OwnedLine[]): Satang {
  return lines.reduce((sum, line) => {
    assertSatang(line.price);
    if (line.owner === "partner") return sum + line.price;
    if (line.owner === "split") return sum + Math.floor(line.price / 2);
    return sum;
  }, 0);
}
