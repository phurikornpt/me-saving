"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FORWARD } from "@/client/nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "@/client/api";
import { fromDrafts, type Card } from "@/client/draftCards";
import { parseFailureMessage } from "@/client/entryDraft";
import { speechErrorMessage, speechRecognitionCtor, transcriptOf, type SpeechRecognitionLike } from "@/client/speech";
import { AiBudgetNote } from "./AiBudgetNote";
import { AuroraCloud, type CloudMode } from "./AuroraCloud";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";
import { CardsReview } from "./CardsReview";

const MAX_LEN = 500; // same limit as the server
/**
 * "จดด้วยประโยคเดียว": type or say one sentence, the AI fills in a card per entry it found (a single entry, income, or a group of items
bought together), the user fixes them and saves all at once.
 * Speech and typing share one text box; nothing is saved until the user confirms.
 */
export function SayScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);

  // ---- voice: opens listening straight away; same text box as typing; only where the browser has a recognizer ----
  // server snapshot false: the first client render matches the server, then the mic appears where supported
  const canListen = useSyncExternalStore(() => () => {}, () => speechRecognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0); // +1 per recognised update: the cloud flickers with it
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const autoStarted = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const r = recognizer;
    return () => r.current?.abort();
  }, []);

  const startListening = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    setMicError(null);
    const r = new Ctor();
    r.lang = "th-TH";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      setText(transcriptOf(e.results).slice(0, MAX_LEN));
      setPulse((n) => n + 1);
    };
    r.onerror = (e) => setMicError(speechErrorMessage(e.error));
    r.onend = () => setListening(false);
    recognizer.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setMicError(speechErrorMessage("other")); // start() throws if a session is already running
    }
  }, []);

  // Entering the screen starts listening. Some browsers (iOS Safari) refuse to start without a tap: then the
  // cloud simply waits in its idle state and a tap on it starts listening.
  useEffect(() => {
    if (canListen && !autoStarted.current) {
      autoStarted.current = true;
      startListening();
    }
  }, [canListen, startListening]);

  const tapCloud = () => {
    if (listening) recognizer.current?.stop();
    else if (canListen) startListening();
    else box.current?.focus();
  };

  const read = useMutation({
    meta: { ai: true }, // the aurora shows the wait; the top bar stays out
    mutationFn: () => api.parseEntryText(text.trim()),
    // Whether it worked or not, it may have used one of today's AI calls.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["aiBudget"] }),
    onSuccess: ({ drafts }) => setCards(fromDrafts(drafts)),
  });

  // Sending ends the voice for good: abort (not stop) so no late result rewrites the text and the mic closes at once.
  const endListening = () => {
    const r = recognizer.current;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      r.abort();
      recognizer.current = null;
    }
    setListening(false);
  };

  const submit = () => {
    if (!text.trim() || read.isPending) return;
    endListening();
    read.mutate();
  };

  const failCode = read.error instanceof ApiError ? read.error.code : "UNKNOWN";

  const cloudMode: CloudMode = read.isPending ? "thinking" : read.isError ? "error" : listening ? "listening" : "idle";
  const caption = read.isPending
    ? "กำลังแยกให้…"
    : listening
      ? "กำลังฟัง… พูดได้เลย แตะเพื่อหยุด"
      : micError
        ? micError
        : text.trim()
          ? "ตรวจข้อความ แก้ได้ แล้วกดส่ง"
          : canListen
            ? "แตะก้อนเมฆแล้วพูดได้เลย"
            : "พิมพ์ประโยคด้านล่างได้เลย";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#0b0d12] text-white">
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => (cards ? setCards(null) : router.back())}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">จดประโยคเดียว</h1>
        {!cards && <AiBudgetNote onDark className="ml-auto" />}
        {cards && <AuroraCloud mode="done" pulse={0} blur={5} className="aurora-in -my-6 ml-auto h-24 w-24" />}
      </header>

      {!cards && (
        <section className="flex flex-1 flex-col items-center px-4 pt-2">
          <button
            type="button"
            onClick={tapCloud}
            aria-label={listening ? "หยุดฟัง" : "แตะเพื่อพูด"}
            className="relative aspect-square w-full max-w-[300px] rounded-full"
          >
            <AuroraCloud mode={cloudMode} pulse={pulse} className="h-full w-full" />
            {canListen && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <Icon name="mic" size={44} fill className="text-white drop-shadow-lg" />
              </span>
            )}
          </button>
          <p className={`mt-1 min-h-6 px-4 text-center text-[15px] ${micError && !listening ? "text-streak" : "text-white/70"}`} role="status">
            {caption}
          </p>

          {read.isError && (
            <div className="mt-3 w-full rounded-2xl bg-white/[0.08] p-4" role="alert">
              <p className="text-white/80">{parseFailureMessage(failCode)}</p>
              <Link href="/new" transitionTypes={FORWARD} className="btn3d key mt-3 inline-flex">จดเอง</Link>
            </div>
          )}

          <div
            className={`safe-bottom mt-auto flex w-full flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.07] p-3 pl-4 transition-opacity ${
              read.isPending ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label htmlFor="say-text" className="text-[11px] tracking-wide text-white/45">
              ข้อความ (แก้ได้)
            </label>
            <textarea
              id="say-text"
              ref={box}
              value={text}
              maxLength={MAX_LEN}
              rows={2}
              autoFocus={!canListen}
              placeholder="เช่น ข้าวมันไก่ 60 หารแฟน"
              onChange={(e) => {
                if (listening) recognizer.current?.stop(); // typing takes over from the voice
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full resize-none bg-transparent text-lg leading-relaxed text-white outline-none placeholder:text-white/40"
            />
            <div className="flex items-center justify-between gap-3">
              <Link href="/new" transitionTypes={FORWARD} className="text-xs text-white/50 underline">
                จดเองแทน
              </Link>
              <button className="btn3d !px-5 !py-2.5" disabled={!text.trim() || read.isPending} onClick={submit}>
                {read.isPending ? <><Spinner /> กำลังอ่าน…</> : <>ส่ง <Icon name="arrow_upward" size={20} /></>}
              </button>
            </div>
          </div>
        </section>
      )}

      {cards && (
        <CardsReview
          className="scope-night"
          cards={cards}
          onChange={setCards}
          emptyHint="ลบหมดแล้ว กดกลับเพื่อพูดใหม่"
          intro={
            <>
              <p className="truncate text-sm text-ink-3">&ldquo;{text.trim()}&rdquo;</p>
              <p className="text-xs text-ink-3">
                ตรวจและแก้ได้ก่อนบันทึก
                {cards.some((c) => c.uncertain.length > 0 || (c.type === "group" && c.lines.some((l) => l.uncertain.length > 0))) && " · ช่องที่มีกรอบเหลือง AI ไม่แน่ใจ"}
              </p>
            </>
          }
        />
      )}
    </main>
  );
}
