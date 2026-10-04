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
