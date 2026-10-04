"use client";

import { useState } from "react";
import { cardsFromRows, type BackfillRow } from "@/client/backfill";
import type { Card } from "@/client/draftCards";
import { bangkokDay } from "@/domain/day";
import { CardsReview } from "./CardsReview";

/** Past entries read from a bank-history page or several pictures: the same cards as a spoken sentence, with a tick on each. */
export function BackfillReview({ initial, failed, onCancel }: { initial: BackfillRow[]; failed: number; onCancel: () => void }) {
  const [cards, setCards] = useState<Card[]>(() => cardsFromRows(initial, bangkokDay(new Date())));
  const dupCount = cards.filter((c) => c.duplicate).length;

  return (
    <CardsReview
      cards={cards}
      onChange={setCards}
      selectable
      doneLabel="จดย้อนหลังแล้ว"
      onCancel={onCancel}
      emptyHint="ลบหมดแล้ว กดยกเลิกเพื่อเลือกรูปใหม่"
      intro={
        <>
          <p className="font-medium">จดย้อนหลัง {initial.length} รายการ</p>
          <p className="text-xs text-ink-3">
            ติ๊กรายการที่จะจด แก้ได้ทุกช่อง รวมหรือแยกกลุ่มได้
            {dupCount > 0 && ` · ${dupCount} รายการอาจซ้ำกับที่จดไว้ (ไม่ได้ติ๊กให้)`}
            {failed > 0 && ` · อ่านไม่ได้ ${failed} รูป`}
          </p>
        </>
      }
    />
  );
}
