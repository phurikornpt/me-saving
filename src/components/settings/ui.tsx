"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../Icon";

/** A settings sub-page: back arrow to the settings list, a title, and one optional action (usually "+ เพิ่ม"). */
export function SettingsPage({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="safe-top flex items-center gap-2 pb-3">
        <Link href="/settings" className="rounded-full p-2" aria-label="กลับไปตั้งค่า">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="font-display min-w-0 flex-1 truncate text-xl">{title}</h1>
        {action}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </main>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="pill flex items-center gap-1 !py-1.5 text-sm" onClick={onClick}>
      <Icon name="add" size={18} /> {label}
    </button>
  );
}

/** A labelled card of rows separated by hairlines. */
export function SettingsGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-1 px-2 text-sm text-ink-3">{title}</h2>}
      <div className="divide-y divide-line rounded-[24px] bg-card px-4">{children}</div>
      {footer && <p className="mt-1 px-2 text-xs text-ink-3">{footer}</p>}
    </section>
  );
}

const rowBody = (icon: string, title: string, summary?: string, tone?: string) => (
  <>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface">
      <Icon name={icon} size={20} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate">{title}</span>
      {summary && <span className={`block truncate text-xs ${tone ?? "text-ink-3"}`}>{summary}</span>}
    </span>
  </>
);

/** A row that opens a sub-page. */
export function SettingsLink({ href, icon, title, summary }: { href: string; icon: string; title: string; summary?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-3">
      {rowBody(icon, title, summary)}
      <Icon name="chevron_right" className="text-ink-3" />
    </Link>
  );
}

/** A row inside a sub-page: tap it to edit. */
export function SettingsItem({
  icon, title, summary, summaryTone, trailing, onClick,
}: { icon: string; title: string; summary?: string; summaryTone?: string; trailing?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="flex w-full items-center gap-3 py-3 text-left" onClick={onClick}>
      {rowBody(icon, title, summary, summaryTone)}
      {trailing}
      {onClick && <Icon name="edit" size={18} className="text-ink-3" />}
    </Tag>
  );
}

export const emptyHint = (text: string) => <p className="py-4 text-center text-sm text-ink-3">{text}</p>;

export const inputClass = "w-full rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink";
export const areaClass = "w-full rounded-2xl border-2 border-line bg-card p-3 outline-none focus:border-ink";

/** Pick one icon from `choices`. A fixed square: the button's line-height would otherwise make it an oval. */
export function IconPicker({ choices, value, onChange }: { choices: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={n}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className="pill flex h-10 w-10 items-center justify-center !p-0"
        >
          <Icon name={n} size={20} />
        </button>
      ))}
    </div>
  );
}
