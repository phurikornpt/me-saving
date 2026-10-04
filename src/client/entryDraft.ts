import type { EntryTextDraftDTO, SplitMode } from "./types";

/** The split a draft (as edited) will be saved with. Income, "none" and nobody picked = all ours. */
export function splitOf(kind: "expense" | "income", split: EntryTextDraftDTO["split"], personIds: string[]): SplitMode | undefined {
  if (kind !== "expense" || split === "none" || personIds.length === 0) return undefined;
  return { kind: split, people: personIds };
}

/** Why a draft can't be saved yet, in Thai; null when it can. */
export function draftProblem(total: number, split: EntryTextDraftDTO["split"], personIds: string[], kind: "expense" | "income"): string | null {
  if (total <= 0) return "ใส่จำนวนเงินก่อน";
  if (kind === "expense" && split !== "none" && personIds.length === 0) return "เลือกคนที่หารด้วยก่อน";
  return null;
}

/** Thai message for why the sentence couldn't be turned into a draft. */
export function parseFailureMessage(code: string): string {
  switch (code) {
    case "RATE_LIMITED":
      return "ใช้ AI ครบโควตาของวันนี้แล้ว จดเองไปก่อนนะ";
    case "AI_UNAVAILABLE":
      return "AI พักอยู่ตอนนี้ ลองใหม่อีกครั้ง หรือจดเองไปก่อน";
    case "INVALID_TEXT":
      return "พิมพ์หรือพูดให้สั้นลงหน่อย (ไม่เกิน 300 ตัวอักษร)";
    default:
      return "อ่านประโยคนี้ไม่สำเร็จ ลองอีกครั้ง หรือจดเอง";
  }
}
