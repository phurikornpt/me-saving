/** The AI's summary as separate lines to reveal one after another. Blank lines and stray bullets are dropped. */
export function summaryLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}
