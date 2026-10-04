import type { EntryDraftDTO, EntryTextDraftDTO, SplitMode } from "./types";

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
      return "พิมพ์หรือพูดให้สั้นลงหน่อย (ไม่เกิน 500 ตัวอักษร)";
    default:
      return "อ่านประโยคนี้ไม่สำเร็จ ลองอีกครั้ง หรือจดเอง";
  }
}

/**
 * The current SayScreen edits one entry: until it learns about several, squeeze what the sentence
 * described into one expense. One expense (single or group) is kept as is; several are merged
 * (total = sum, note = their names). Incomes are ignored unless the sentence had nothing else.
 */
export function collapseToSingle(drafts: EntryDraftDTO[]): EntryTextDraftDTO {
  const strip = (d: Extract<EntryDraftDTO, { mode: "single" }>): EntryTextDraftDTO => {
    const { mode, ...rest } = d;
    void mode;
    return rest;
  };
  const expenses = drafts.filter((d) => d.mode === "group" || d.kind === "expense");
  if (expenses.length === 0) return strip(drafts[0] as Extract<EntryDraftDTO, { mode: "single" }>);
  if (expenses.length === 1 && expenses[0].mode === "single") return strip(expenses[0]);

  const parts = expenses.flatMap((d) =>
    d.mode === "single"
      ? [{ note: d.note, amount: d.amount, categoryId: d.categoryId, walletId: d.walletId, uncertain: d.uncertain as string[] }]
      : d.lines.map((l) => ({ note: l.note, amount: l.amount, categoryId: l.categoryId, walletId: d.walletId, uncertain: l.uncertain as string[] })),
  );
  const amounts = parts.map((p) => p.amount);
  const categories = new Set(parts.map((p) => p.categoryId));
  const uncertain = new Set(parts.flatMap((p) => p.uncertain));
  const names = parts.flatMap((p) => p.note ?? []);
  const groupName = expenses.length === 1 && expenses[0].mode === "group" ? expenses[0].name : null;
  if (amounts.some((a) => a === null)) uncertain.add("amount");
  const note = [groupName, names.join(", ")].filter(Boolean).join(": ").slice(0, 200);
  return {
    kind: "expense",
    amount: amounts.some((a) => a !== null) ? amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0) : null,
    categoryId: categories.size === 1 ? [...categories][0] : null,
    note: note || null,
    split: "none",
    personIds: [],
    walletId: parts.find((p) => p.walletId)?.walletId ?? null,
    uncertain: [...uncertain] as EntryTextDraftDTO["uncertain"],
  };
}
