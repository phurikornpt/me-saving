"use client";

import Link from "next/link";
import { activePeople, personColor } from "@/client/people";
import type { LineOwners, PersonDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { Icon } from "./Icon";

/** A small coloured dot that marks a person everywhere in the app. */
export const PersonDot = ({ people, id, size = 10 }: { people: PersonDTO[]; id: string; size?: number }) => (
  <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: personColor(people, id) }} />
);

/**
 * Pick who shares something. Multi-select by default; `single` makes it pick exactly one.
 * Archived people never show. With nobody set up yet, it points to settings instead.
 */
export function PeoplePicker({
  people, selected, onChange, single = false, label,
}: { people: PersonDTO[]; selected: string[]; onChange: (ids: string[]) => void; single?: boolean; label?: string }) {
  const visible = activePeople(people);
  if (visible.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        ยังไม่มีคนที่หารด้วย <Link href="/settings#people" className="underline">เพิ่มที่การตั้งค่า</Link>
      </p>
    );
  }
  const toggle = (id: string) =>
    onChange(single ? [id] : selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label ?? "เลือกคน"}>
      {visible.map((p) => (
        <button key={p.id} className="pill flex items-center gap-1.5 text-sm" aria-pressed={selected.includes(p.id)} onClick={() => toggle(p.id)}>
          <PersonDot people={people} id={p.id} /> {p.name}
        </button>
      ))}
    </div>
  );
}

/** "เรา", "แฟน", "เรา+แฟน", "แฟน+A" */
export function ownersLabel(people: PersonDTO[], o: LineOwners): string {
  const names = o.people.map((id) => people.find((p) => p.id === id)?.name ?? "?");
  return [...(o.me ? ["เรา"] : []), ...names].join("+");
}

/** The chip on a line that says who it's for: black for us, the person's colour, or a blend when shared. */
export function OwnersChip({ people, owners, onClick }: { people: PersonDTO[]; owners: LineOwners; onClick: () => void }) {
  const colors = [...(owners.me ? ["var(--ink)"] : []), ...owners.people.map((id) => personColor(people, id))];
  const background = colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.join(", ")})`;
  const label = ownersLabel(people, owners);
  return (
    <button
      className={`max-w-36 min-w-14 truncate rounded-full px-3 py-1.5 text-sm font-medium ${colors.length === 1 && owners.me ? "text-[var(--on-ink)]" : "text-white"}`}
      style={{ background }}
      onClick={onClick}
      aria-label={`ของ: ${label} (แตะเพื่อเปลี่ยน)`}
    >
      {owners.people.length > 1 || (owners.me && owners.people.length > 0) ? <><Icon name="group" size={14} /> </> : null}
      {label}
    </button>
  );
}

/** Toggle เรา and each person on the bill. At least one must stay on. */
export function OwnersToggle({
  people, onBill, owners, onChange,
}: { people: PersonDTO[]; onBill: PersonDTO[]; owners: LineOwners; onChange: (o: LineOwners) => void }) {
  const flip = (next: LineOwners) => (next.me || next.people.length > 0) && onChange(next);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="ของใคร">
      <button className="pill text-sm" aria-pressed={owners.me} onClick={() => flip({ ...owners, me: !owners.me })}>เรา</button>
      {onBill.map((p) => {
        const on = owners.people.includes(p.id);
        return (
          <button
            key={p.id}
            className="pill flex items-center gap-1.5 text-sm"
            aria-pressed={on}
            onClick={() => flip({ ...owners, people: on ? owners.people.filter((x) => x !== p.id) : [...owners.people, p.id] })}
          >
            <PersonDot people={people} id={p.id} /> {p.name}
          </button>
        );
      })}
    </div>
  );
}

/** The footer of a group: our part, each person's part, the total. */
export function SplitSummary({
  people, mine, shares, total,
}: { people: PersonDTO[]; mine: number; shares: { personId: string; amount: number }[]; total: number }) {
  return (
    <div className="mb-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
      <span>ของเรา <b className="text-expense">฿{formatBaht(mine)}</b></span>
      {shares.map((s) => (
        <span key={s.personId} className="flex items-center gap-1">
          <PersonDot people={people} id={s.personId} /> {people.find((p) => p.id === s.personId)?.name}{" "}
          <b style={{ color: personColor(people, s.personId) }}>฿{formatBaht(s.amount)}</b>
        </span>
      ))}
      <span>รวม <b>฿{formatBaht(total)}</b></span>
    </div>
  );
}
