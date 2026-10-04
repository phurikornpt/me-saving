"use client";

import { describeShares } from "@/client/people";
import type { Card, CardSplit, GroupCard, LineCard, SingleCard } from "@/client/draftCards";
import { cardTotal, groupTotal, MAX_CARDS, satangOf, splitMode } from "@/client/draftCards";
import type { CategoryDTO, PersonDTO, WalletDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { sharesFor, sumShares } from "@/domain/split";
import { isBackdated } from "@/client/presetChoices";
import { Icon } from "./Icon";
import { PeoplePicker } from "./People";
import { WalletPicker } from "./Wallets";
import { WhenField } from "./WhenField";

const SPLITS: [CardSplit, string][] = [
  ["none", "ของเราทั้งหมด"],
  ["equal", "หารเท่ากัน"],
  ["theirs", "ของเขาทั้งหมด"],
];
const flag = (on: boolean) => (on ? "flash-once rounded-2xl ring-2 ring-streak" : "");
const cleanBaht = (v: string) => v.replace(/[^\d.]/g, "");

export interface CardsCtx {
  cards: Card[];
  categories: CategoryDTO[];
  people: PersonDTO[];
  wallets: WalletDTO[];
  /** Cards carry a tick (bank-history pages: untick what is already on file). */
  selectable: boolean;
  patch: (id: string, p: Partial<SingleCard> | Partial<GroupCard>) => void;
  patchLine: (lineId: string, p: Partial<LineCard>) => void;
  remove: (id: string) => void;
  merge: (id: string, into: string) => void;
  split: (id: string) => void;
  moveLine: (lineId: string, to: string | "single") => void;
  removeLine: (lineId: string) => void;
}

function CategoryChips({ categories, value, onChange, kind, unsure }: {
  categories: CategoryDTO[]; value: string | null; onChange: (id: string) => void; kind: "expense" | "income"; unsure: boolean;
}) {
  return (
    <div className={`-mx-1 flex gap-2 overflow-x-auto p-1 ${flag(unsure)}`} role="group" aria-label="หมวด">
      {categories.filter((c) => c.kind === kind && !c.archived).map((c) => (
        <button
          key={c.id}
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs ${value === c.id ? "bg-ink text-on-ink" : "bg-card"}`}
        >
          <Icon name={c.icon} size={18} />
          {c.name}
        </button>
      ))}
    </div>
  );
}

function Shell({ card, ctx, title, children }: { card: Card; ctx: CardsCtx; title: string; children: React.ReactNode }) {
  return (
    <section className={`mx-4 mt-3 rounded-3xl border-2 bg-card/60 p-3 transition-opacity ${card.duplicate ? "flash-once border-streak" : "border-line"} ${card.selected ? "" : "opacity-60"}`}>
      <div className="mb-2 flex items-center gap-2">
        {ctx.selectable && (
          <input type="checkbox" className="size-5" checked={card.selected} aria-label="จดรายการนี้" onChange={(e) => ctx.patch(card.id, { selected: e.target.checked })} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-3">{title}</h2>
        {card.duplicate && <span className="shrink-0 text-xs text-ink-2">อาจซ้ำกับที่จดไว้</span>}
        <button className="rounded-full p-1 text-ink-3" aria-label="ลบรายการนี้" onClick={() => ctx.remove(card.id)}>
          <Icon name="delete" size={20} />
        </button>
      </div>
      {children}
    </section>
  );
}

const BackdateNote = ({ card }: { card: Card }) =>
  card.when.kind === "at" && isBackdated(card.when, new Date()) ? (
    <p className="mt-1 px-1 text-xs text-ink-3">จดย้อนหลัง: เงินถูกบันทึกในวันนั้น แต่ไม่ช่วยต่อ streak</p>
  ) : null;

function MergeSelect({ ctx, id }: { ctx: CardsCtx; id: string }) {
  const targets = ctx.cards.filter((c) => c.id !== id && (c.type === "group" || c.kind === "expense"));
  if (targets.length === 0) return null;
  return (
    <select
      aria-label="รวมกับ"
      className="rounded-full border-2 border-line bg-card px-3 py-1.5 text-xs"
      value=""
      onChange={(e) => e.target.value && ctx.merge(id, e.target.value)}
    >
      <option value="">รวมกับ…</option>
      {targets.map((t) => <option key={t.id} value={t.id}>{label(t, ctx.cards)}</option>)}
    </select>
  );
}

/** A short name for a card in pickers: "ค่า 7-11" / "ข้าว ฿60" / "รายการ 2". */
export function label(c: Card, cards: Card[]): string {
  const name = c.type === "group" ? c.name.trim() || "กลุ่ม" : c.note.trim() || `รายการ ${cards.indexOf(c) + 1}`;
  return `${name} ฿${formatBaht(cardTotal(c))}`;
}

export function SingleCardView({ card, ctx }: { card: SingleCard; ctx: CardsCtx }) {
  const total = satangOf(card.amount);
  const mode = splitMode(card);
  let preview = "";
  try {
    const shares = mode && total > 0 ? sharesFor(total, mode) : [];
    if (shares.length > 0) preview = `ของเรา ฿${formatBaht(total - sumShares(shares))} · ${describeShares(ctx.people, shares)}`;
  } catch {}
  const has = (f: SingleCard["uncertain"][number]) => card.uncertain.includes(f);
  return (
    <Shell card={card} ctx={ctx} title={card.kind === "income" ? "รายรับ" : "รายจ่าย"}>
      <div className="flex gap-2">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            className="pill"
            aria-pressed={card.kind === k}
            onClick={() => ctx.patch(card.id, {
              kind: k,
              split: k === "income" ? "none" : card.split,
              categoryId: ctx.categories.find((c) => c.id === card.categoryId)?.kind === k ? card.categoryId : null,
            })}
          >
            {k === "expense" ? "รายจ่าย" : "รายรับ"}
          </button>
        ))}
      </div>
      <label className={`mt-2 flex items-center gap-2 p-1 ${flag(has("amount"))}`}>
        <span className="text-xl text-ink-3">฿</span>
        <input
          inputMode="decimal"
          aria-label="จำนวนเงิน (บาท)"
          value={card.amount}
          placeholder="0"
          onChange={(e) => ctx.patch(card.id, { amount: cleanBaht(e.target.value) })}
          className={`min-w-0 flex-1 bg-transparent text-3xl font-bold outline-none ${card.kind === "income" ? "text-income" : "text-ink"}`}
        />
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          value={card.note}
          maxLength={200}
          aria-label="โน้ต"
          placeholder="โน้ต (ไม่ใส่ก็ได้)"
          onChange={(e) => ctx.patch(card.id, { note: e.target.value })}
          className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <WhenField value={card.when} onChange={(when) => ctx.patch(card.id, { when })} />
      </div>
      <BackdateNote card={card} />
      <p className="mt-1 min-h-5 truncate text-sm text-partner">{preview}</p>
      {card.kind === "expense" && (
        <div className={`p-1 ${flag(has("person"))}`}>
          <div className="flex flex-wrap gap-2">
            {SPLITS.map(([k, text]) => (
              <button key={k} className="pill" aria-pressed={card.split === k} onClick={() => ctx.patch(card.id, { split: k })}>{text}</button>
            ))}
          </div>
          {card.split !== "none" && (
            <div className="mt-2">
              <PeoplePicker people={ctx.people} selected={card.personIds} onChange={(personIds) => ctx.patch(card.id, { personIds })} label="หารกับใคร" />
            </div>
          )}
        </div>
      )}
      <div className="mt-2">
        <CategoryChips categories={ctx.categories} kind={card.kind} value={card.categoryId} unsure={has("category")} onChange={(categoryId) => ctx.patch(card.id, { categoryId })} />
      </div>
      <div className={`mt-2 p-1 ${flag(has("wallet"))}`}>
        <WalletPicker wallets={ctx.wallets} value={card.walletId} onChange={(walletId) => ctx.patch(card.id, { walletId })} label={card.kind === "income" ? "เข้ากระเป๋า" : "จ่ายจากกระเป๋า"} />
      </div>
      {card.kind === "expense" && <div className="mt-2"><MergeSelect ctx={ctx} id={card.id} /></div>}
    </Shell>
  );
}

function LineView({ line, group, ctx }: { line: LineCard; group: GroupCard; ctx: CardsCtx }) {
  const owner: CardSplit = line.personIds.length === 0 && line.me ? "none" : line.me ? "equal" : "theirs";
  const setOwner = (k: CardSplit) => ctx.patchLine(line.id, { me: k !== "theirs", personIds: k === "none" ? [] : line.personIds });
  const has = (f: LineCard["uncertain"][number]) => line.uncertain.includes(f);
  const others = ctx.cards.filter((c): c is GroupCard => c.type === "group" && c.id !== group.id);
  return (
    <li className="rounded-2xl bg-bg p-2">
      <div className="flex items-center gap-2">
        <input
          value={line.note}
          maxLength={100}
          aria-label="ชื่อของ"
          placeholder="ชื่อของ"
          onChange={(e) => ctx.patchLine(line.id, { note: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <label className={`flex items-center gap-1 p-0.5 ${flag(has("amount"))}`}>
          <span className="text-ink-3">฿</span>
          <input
            inputMode="decimal"
            aria-label="ราคา (บาท)"
            value={line.amount}
            placeholder="0"
            onChange={(e) => ctx.patchLine(line.id, { amount: cleanBaht(e.target.value) })}
            className="w-20 bg-transparent text-right text-base font-semibold outline-none"
          />
        </label>
        <button className="rounded-full p-1 text-ink-3" aria-label="ลบของชิ้นนี้" onClick={() => ctx.removeLine(line.id)}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className={`mt-1 flex flex-wrap gap-1.5 p-0.5 ${flag(has("person"))}`}>
        {SPLITS.map(([k, text]) => (
          <button key={k} className="pill !px-3 !py-1 text-xs" aria-pressed={owner === k} onClick={() => setOwner(k)}>{text}</button>
        ))}
      </div>
      {owner !== "none" && (
        <div className="mt-1">
          <PeoplePicker people={ctx.people} selected={line.personIds} onChange={(personIds) => ctx.patchLine(line.id, { personIds })} label="กับใคร" />
        </div>
      )}
      <div className="mt-1">
        <CategoryChips categories={ctx.categories} kind="expense" value={line.categoryId} unsure={has("category")} onChange={(categoryId) => ctx.patchLine(line.id, { categoryId })} />
      </div>
      <select
        aria-label="ย้ายไป"
        className="mt-1 rounded-full border-2 border-line bg-card px-3 py-1 text-xs"
        value=""
        onChange={(e) => e.target.value && ctx.moveLine(line.id, e.target.value)}
      >
        <option value="">ย้ายไป…</option>
        {ctx.cards.length < MAX_CARDS && <option value="single">แยกเป็นรายการเดี่ยว</option>}
        {others.map((g) => <option key={g.id} value={g.id}>{label(g, ctx.cards)}</option>)}
      </select>
    </li>
  );
}

export function GroupCardView({ card, ctx }: { card: GroupCard; ctx: CardsCtx }) {
  return (
    <Shell card={card} ctx={ctx} title={`ซื้อด้วยกัน · ${card.lines.length} อย่าง`}>
      <div className="flex items-center gap-2">
        <input
          value={card.name}
          maxLength={100}
          aria-label="ชื่อกลุ่ม"
          placeholder="ชื่อกลุ่ม เช่น ค่า 7-11 (ไม่ใส่ก็ได้)"
          onChange={(e) => ctx.patch(card.id, { name: e.target.value })}
          className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <WhenField value={card.when} onChange={(when) => ctx.patch(card.id, { when })} />
      </div>
      <BackdateNote card={card} />
      <ul className="mt-2 flex flex-col gap-2">
        {card.lines.map((l) => <LineView key={l.id} line={l} group={card} ctx={ctx} />)}
      </ul>
      <p className="mt-2 text-right text-lg font-bold">รวม ฿{formatBaht(groupTotal(card))}</p>
      <div className={`mt-1 p-1 ${flag(card.uncertain.includes("wallet"))}`}>
        <WalletPicker wallets={ctx.wallets} value={card.walletId} onChange={(walletId) => ctx.patch(card.id, { walletId })} label="จ่ายจากกระเป๋า" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <MergeSelect ctx={ctx} id={card.id} />
        {card.lines.length > 1 && ctx.cards.length - 1 + card.lines.length <= MAX_CARDS && (
          <button className="pill" onClick={() => ctx.split(card.id)}>แยกเป็นรายการเดี่ยวทั้งหมด</button>
        )}
      </div>
    </Shell>
  );
}
