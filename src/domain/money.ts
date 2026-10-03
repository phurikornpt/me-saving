import { DomainError } from "./errors";

/** Money is always an integer number of satang (฿1 = 100). Never use floats. */
export type Satang = number;

export function assertSatang(value: number): Satang {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("INVALID_AMOUNT", `not a valid satang amount: ${value}`);
  }
  return value;
}

/** Parse a user-typed baht string ("84.5", "1,200") into satang without float math. */
export function parseBaht(input: string): Satang {
  const cleaned = input.replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new DomainError("INVALID_AMOUNT", `cannot parse: ${input}`);
  const baht = Number(match[1]);
  const satang = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return assertSatang(baht * 100 + satang);
}

/** 8450 -> "84.50", 8400 -> "84" (drops .00 for compact lists). */
export function formatBaht(satang: Satang): string {
  const baht = Math.trunc(satang / 100);
  const rest = satang % 100;
  const intPart = baht.toLocaleString("en-US");
  return rest === 0 ? intPart : `${intPart}.${String(rest).padStart(2, "0")}`;
}

/** Calendar-cell format: 32000 -> "320", 120000 -> "1.2k", 1500000 -> "15k". */
export function formatCompact(satang: Satang): string {
  const baht = satang / 100;
  if (baht < 1000) return String(Math.round(baht));
  const k = Math.round((baht / 1000) * 10) / 10;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}
