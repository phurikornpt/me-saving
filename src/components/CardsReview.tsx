"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { api, describeFailure } from "@/client/api";
import { bumpCategory, sortByUsage } from "@/client/categoryUsage";
import {
  cardsProblem, headlineTotal, mergeCards, moveLine, removeCard, removeLine, splitGroup, toBatchItems, update, updateLine, usedCategoryIds,
  type Card,
} from "@/client/draftCards";
import { DUR } from "@/client/motion";
import { useCategories, usePeople, useWallets } from "@/client/queries";
import { useAfterLog } from "@/client/useAfterLog";
import { formatBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Spinner } from "./Loading";
import { GroupCardView, SingleCardView, type CardsCtx } from "./SayCards";

/**
 * The one review screen for everything that arrives as a draft: a spoken sentence, a bank-history page, several
 * pictures. A card per entry or group, each with its own time; fix them, then save all at once.
 * `selectable` adds a tick per card (for pages where some rows may already be on file).
 */
export function CardsReview({
  cards,
  onChange,
  intro,
  emptyHint,
  selectable = false,
  doneLabel = "จดแล้ว",
  onCancel,
  className = "",
}: {
  cards: Card[];
  onChange: (cards: Card[]) => void;
  intro: React.ReactNode;
  emptyHint: string;
  selectable?: boolean;
  doneLabel?: string;
  onCancel?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();

  const problem = cardsProblem(cards);
  const edit = (f: (c: Card[]) => Card[]) => onChange(f(cards));
  const ctx: CardsCtx = {
    cards,
    categories: sortByUsage(categories),
    people,
    wallets,
    selectable,
    patch: (id, p) => edit((c) => update(c, id, p)),
    patchLine: (id, p) => edit((c) => updateLine(c, id, p)),
    remove: (id) => edit((c) => removeCard(c, id)),
    merge: (id, into) => edit((c) => mergeCards(c, id, into)),
    split: (id) => edit((c) => splitGroup(c, id)),
    moveLine: (id, to) => edit((c) => moveLine(c, id, to)),
    removeLine: (id) => edit((c) => removeLine(c, id)),
  };

  const picked = cards.filter((c) => c.selected);
  const save = useMutation({
    mutationFn: (all: Card[]) => api.recordBatch({ items: toBatchItems(all) }),
    onSuccess: (out, all) => {
      usedCategoryIds(all).forEach(bumpCategory);
      afterLog(out);
      void qc.invalidateQueries({ queryKey: ["entries"] });
      fb.toast({
        message: `${doneLabel} ${out.entries.length} รายการ · ฿${formatBaht(headlineTotal(all))}`,
        action: {
          label: "ย้อนกลับ",
          run: () => void Promise.all(out.entries.map((e) => api.deleteEntry(e.id))).then(() => qc.invalidateQueries()),
        },
      });
      router.replace("/");
    },
    onError: (e) => fb.toast({ tone: "error", ms: 9000, message: describeFailure("บันทึกไม่สำเร็จ", e) }),
  });

  return (
    <motion.div
      className={`flex flex-1 flex-col ${className}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: [0.32, 0.72, 0, 1] }}
    >
      <section className="px-5 pt-1">{intro}</section>

      {cards.map((c) => (c.type === "single" ? <SingleCardView key={c.id} card={c} ctx={ctx} /> : <GroupCardView key={c.id} card={c} ctx={ctx} />))}
      {cards.length === 0 && <p className="mt-6 text-center text-ink-3">{emptyHint}</p>}

      <div className="safe-bottom sticky bottom-0 mt-auto border-t border-line bg-bg px-5 pt-3">
        <div className="flex gap-3">
          {onCancel && (
            <button className="btn3d" onClick={onCancel} disabled={save.isPending}>
              ยกเลิก
            </button>
          )}
          <button className="btn3d flex-1 py-4 text-lg" disabled={problem !== null || save.isPending} onClick={() => save.mutate(cards)}>
            {save.isPending ? <><Spinner /> กำลังบันทึก…</> : `บันทึก${picked.length === cards.length ? "ทั้งหมด" : ""} (${picked.length} รายการ · ฿${formatBaht(headlineTotal(cards))})`}
          </button>
        </div>
        {problem && (
          <p className="mt-1 text-center text-xs text-expense" role="status">
            {problem}
          </p>
        )}
      </div>
    </motion.div>
  );
}
