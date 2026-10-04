"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FORWARD } from "@/client/nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError, describeFailure } from "@/client/api";
import { bumpCategory, sortByUsage } from "@/client/categoryUsage";
import { collapseToSingle, draftProblem, parseFailureMessage, splitOf } from "@/client/entryDraft";
import { describeShares } from "@/client/people";
import { useCategories, usePeople, useWallets } from "@/client/queries";
import { speechErrorMessage, speechRecognitionCtor, transcriptOf, type SpeechRecognitionLike } from "@/client/speech";
import type { EntryTextDraftDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht, parseBaht } from "@/domain/money";
import { sharesFor, sumShares } from "@/domain/split";
import { AiBudgetNote } from "./AiBudgetNote";
import { AuroraCloud, type CloudMode } from "./AuroraCloud";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";
import { PeoplePicker } from "./People";
import { WalletPicker } from "./Wallets";

const MAX_LEN = 300; // same limit as the server
const SPLITS = [
  ["none", "ของเราทั้งหมด"],
  ["equal", "หารเท่ากัน"],
  ["theirs", "ของเขาทั้งหมด"],
] as const;

/**
 * "จดด้วยประโยคเดียว": type or say one sentence, the AI fills in a draft, the user fixes it and taps save.
 * Speech and typing share one text box; nothing is saved until the user confirms.
 */
export function SayScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();

  const [text, setText] = useState("");
  const [draft, setDraft] = useState<EntryTextDraftDTO | null>(null);
  // the draft as edited by the user
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [split, setSplit] = useState<EntryTextDraftDTO["split"]>("none");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [note, setNote] = useState("");

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
    mutationFn: () => api.parseEntryText(text.trim()),
    // Whether it worked or not, it may have used one of today's AI calls.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["aiBudget"] }),
    onSuccess: ({ drafts }) => {
      const d = collapseToSingle(drafts);
      setDraft(d);
      setKind(d.kind);
      setAmount(d.amount ? formatBaht(d.amount).replace(/,/g, "") : "");
      setCategoryId(d.categoryId);
      setSplit(d.split);
      setPersonIds(d.personIds);
      setWalletId(d.walletId);
      setNote(d.note ?? "");
    },
  });

  const submit = () => {
    recognizer.current?.stop();
    if (text.trim() && !read.isPending) read.mutate();
  };

  const total = useMemo(() => {
    try {
      return amount ? parseBaht(amount) : 0;
    } catch {
      return 0;
    }
  }, [amount]);
  const mode = splitOf(kind, split, personIds);
  const preview = (() => {
    if (!mode) return null;
    try {
      return sharesFor(total, mode);
    } catch {
      return null;
    }
  })();
  const problem = draftProblem(total, split, personIds, kind);
  const unsure = (f: EntryTextDraftDTO["uncertain"][number]) => draft?.uncertain.includes(f) ?? false;
  const flag = (f: EntryTextDraftDTO["uncertain"][number]) => (unsure(f) ? "rounded-2xl ring-2 ring-streak" : "");
  const visible = useMemo(() => sortByUsage(categories.filter((c) => c.kind === kind && !c.archived)), [categories, kind]);

  const save = useMutation({
    mutationFn: () =>
      api.recordEntry({
        kind,
        total,
        categoryId,
        note: note.trim() || null,
        split: mode,
        source: "manual",
        walletId: walletId ?? undefined,
      }),
    onSuccess: (out) => {
      if (categoryId) bumpCategory(categoryId);
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `จดแล้ว ฿${formatBaht(out.entry.total)}${out.entry.shares.length ? ` · ${describeShares(people, out.entry.shares)}` : ""}`,
        action: { label: "ย้อนกลับ", run: () => void api.deleteEntry(out.entry.id).then(() => qc.invalidateQueries()) },
      });
      router.replace("/");
    },
    onError: (e) => fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e) }),
  });

  const failCode = read.error instanceof ApiError ? read.error.code : "UNKNOWN";

  const cloudMode: CloudMode = read.isPending ? "thinking" : listening ? "listening" : "idle";
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
    <main className={`mx-auto flex min-h-dvh max-w-md flex-col ${draft ? "bg-bg" : "bg-[#0b0d12] text-white"}`}>
      <header className="safe-top flex items-center gap-2 px-4 pb-2">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => (draft ? setDraft(null) : router.back())}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">จดประโยคเดียว</h1>
        {!draft && <AiBudgetNote onDark className="ml-auto" />}
      </header>

      {!draft && (
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

      {draft && (
        <>
          <section className="px-5 pt-1">
            <p className="truncate text-sm text-ink-3">&ldquo;{text.trim()}&rdquo;</p>
            <p className="text-xs text-ink-3">ตรวจและแก้ได้ก่อนบันทึก{draft.uncertain.length > 0 && " · ช่องที่มีกรอบเหลือง AI ไม่แน่ใจ"}</p>
          </section>

          <section className="px-4 pt-3">
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  className="pill"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    if (k === "income") setSplit("none");
                    if (categories.find((c) => c.id === categoryId)?.kind !== k) setCategoryId(null);
                  }}
                >
                  {k === "expense" ? "รายจ่าย" : "รายรับ"}
                </button>
              ))}
            </div>
            <label className={`mt-3 flex items-center gap-2 p-1 ${flag("amount")}`}>
              <span className="text-2xl text-ink-3">฿</span>
              <input
                inputMode="decimal"
                aria-label="จำนวนเงิน (บาท)"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={`min-w-0 flex-1 bg-transparent text-4xl font-bold outline-none ${kind === "income" ? "text-income" : "text-ink"}`}
              />
            </label>
            <p className="h-5 truncate text-sm text-partner">
              {preview && preview.length > 0 && total > 0 && `ของเรา ฿${formatBaht(total - sumShares(preview))} · ${describeShares(people, preview)}`}
            </p>
          </section>

          {kind === "expense" && (
            <section className={`mx-4 mt-2 p-1 ${flag("person")}`}>
              <div className="flex flex-wrap gap-2">
                {SPLITS.map(([k, label]) => (
                  <button key={k} className="pill" aria-pressed={split === k} onClick={() => setSplit(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {split !== "none" && (
                <div className="mt-2">
                  <PeoplePicker people={people} selected={personIds} onChange={setPersonIds} label="หารกับใคร" />
                </div>
              )}
            </section>
          )}

          <section className={`mx-4 mt-2 p-1 ${flag("wallet")}`}>
            <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} label={kind === "income" ? "เข้ากระเป๋า" : "จ่ายจากกระเป๋า"} />
          </section>

          <section className={`mx-4 mt-2 p-1 ${flag("category")}`}>
            <p className="mb-2 text-sm text-ink-3">หมวด</p>
            <div className="grid grid-cols-4 gap-2">
              {visible.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-xs shadow-[0_3px_0_var(--line)] transition active:translate-y-0.5 active:shadow-none ${
                    categoryId === c.id ? "bg-ink text-on-ink" : "bg-card"
                  }`}
                >
                  <Icon name={c.icon} size={28} />
                  <span className="line-clamp-1">{c.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="px-4 pt-3">
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              aria-label="โน้ต"
              placeholder="โน้ต (ไม่ใส่ก็ได้)"
              className="w-full rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
            />
          </section>

          <div className="safe-bottom sticky bottom-0 mt-auto border-t border-line bg-bg px-5 pt-3">
            <button className="btn3d w-full py-4 text-lg" disabled={problem !== null || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <><Spinner /> กำลังบันทึก…</> : "บันทึก"}
            </button>
            {problem && (
              <p className="mt-1 text-center text-xs text-expense" role="status">
                {problem}
              </p>
            )}
            {!categoryId && !problem && <p className="mt-1 text-center text-xs text-ink-3">ยังไม่เลือกหมวด ก็บันทึกได้</p>}
          </div>
        </>
      )}
    </main>
  );
}
