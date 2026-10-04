// Browser speech-to-text (Web Speech API). Chrome/Edge/Android have it; iOS Safari and installed PWAs
// are unreliable, so the mic button only shows where it exists and typing always works.

export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
export interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's recognizer constructor, or null when there is none. Takes `win` so it can be tested. */
export function speechRecognitionCtor(win: unknown = typeof window === "undefined" ? undefined : window): SpeechRecognitionCtor | null {
  const w = win as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

/** Everything heard so far in one recognition session, joined. */
export const transcriptOf = (results: ArrayLike<SpeechResultLike>) =>
  Array.from(results, (r) => r[0].transcript).join("").trim();

/** Thai message for a recognizer error code; null = the user simply stopped it (say nothing). */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "ไม่ได้รับอนุญาตให้ใช้ไมค์ เปิดสิทธิ์ในเบราว์เซอร์ หรือพิมพ์แทนได้เลย";
    case "no-speech":
      return "ไม่ได้ยินเสียง ลองพูดใหม่อีกครั้ง";
    case "audio-capture":
      return "ไม่พบไมโครโฟน พิมพ์แทนได้เลย";
    case "network":
      return "ต่อบริการแปลงเสียงไม่ได้ พิมพ์แทนได้เลย";
    default:
      return "ฟังไม่สำเร็จ ลองใหม่ หรือพิมพ์แทนได้เลย";
  }
}
