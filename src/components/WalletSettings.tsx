"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { WALLET_ICON_CHOICES } from "@/client/icons";
import { useWallets } from "@/client/queries";
import type { WalletDTO } from "@/client/types";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";

const input = "w-full rounded-full border-2 border-line bg-card px-4 py-2 outline-none focus:border-ink";

/** "-1,500.5" -> -150050. Wallet balances may be negative (a card that is owed). null = not a number yet. */
function parseSignedBaht(text: string): number | null {
  const t = text.trim();
  if (!t || t === "-") return null;
  try {
    const v = parseBaht(t.replace(/^-/, ""));
    return t.startsWith("-") ? -v : v;
  } catch {
    return null;
  }
}
const showBaht = (s: number) => `${s < 0 ? "-" : ""}${formatBaht(Math.abs(s)).replace(/,/g, "")}`;
const signedOnly = (v: string) => v.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "");

function WalletIconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WALLET_ICON_CHOICES.map((n) => (
        <button key={n} type="button" aria-label={n} aria-pressed={value === n} onClick={() => onChange(n)} className="pill !p-2">
          <Icon name={n} size={20} />
        </button>
      ))}
    </div>
  );
}

/** Set up wallets: name, icon, what is really in it now, which one is the default. Archived, never deleted. */
export function WalletSettings() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data: wallets = [] } = useWallets();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(WALLET_ICON_CHOICES[1]);
  const [balance, setBalance] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["wallets"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const add = useMutation({
    mutationFn: () => api.createWallet({ name: name.trim(), icon, balance: parseSignedBaht(balance) ?? 0 }),
    onSuccess: () => {
      setName("");
      setBalance("");
      refresh();
    },
    onError: () => fb.toast({ tone: "error", message: "เพิ่มไม่สำเร็จ ตรวจชื่อและยอดอีกครั้ง" }),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateWallet>[1] }) => api.updateWallet(v.id, v.patch),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) =>
      fb.toast({ tone: "error", message: (e as ApiError).code === "LAST_WALLET" ? "ต้องเหลือกระเป๋าอย่างน้อย 1 ใบ" : "บันทึกไม่สำเร็จ" }),
  });

  const active = wallets.filter((w) => !w.archived);
  const hidden = wallets.filter((w) => w.archived);

  return (
    <>
      <ul className="mb-3 divide-y divide-line">
        {active.map((w) =>
          editing === w.id ? (
            <li key={w.id} className="py-2">
              <WalletForm
                wallet={w}
                busy={update.isPending}
                canHide={active.length > 1}
                onCancel={() => setEditing(null)}
                onSave={(patch) => update.mutate({ id: w.id, patch })}
              />
            </li>
          ) : (
            <li key={w.id}>
              <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => setEditing(w.id)}>
                <Icon name={w.icon} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {w.name}
                    {w.isDefault && <span className="ml-1 text-xs text-ink-3">· กระเป๋าหลัก</span>}
                  </span>
                  <span className={`block text-xs ${w.balance < 0 ? "text-expense" : "text-ink-3"}`}>
                    ยอดตอนนี้ {w.balance < 0 ? "-" : ""}฿{formatBaht(Math.abs(w.balance))}
                  </span>
                </span>
                <Icon name="edit" size={18} className="text-ink-3" />
              </button>
            </li>
          ),
        )}
      </ul>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input className={input} placeholder="ชื่อ เช่น ธนาคาร, บัตรเครดิต" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <input
            className={`${input} w-32`}
            inputMode="decimal"
            placeholder="ยอดตอนนี้"
            value={balance}
            onChange={(e) => setBalance(signedOnly(e.target.value))}
            aria-label="ยอดเงินตอนนี้ (บาท)"
          />
        </div>
        <WalletIconPicker value={icon} onChange={setIcon} />
        <button className="btn3d" disabled={!name.trim() || (balance !== "" && parseSignedBaht(balance) === null) || add.isPending} onClick={() => add.mutate()}>
          <Icon name="add" size={20} /> เพิ่มกระเป๋า
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        ยอดของแต่ละกระเป๋าคิดจากยอดตั้งต้นบวกลบรายการที่จด ถ้าไม่ตรงกับเงินจริง แตะกระเป๋าแล้วใส่ยอดที่มีจริงตอนนี้
        บัตรเครดิตใส่ยอดติดลบได้ (เช่น -1500) จ่ายบิลบัตรให้ใช้ &quot;โอน&quot; จากธนาคารไปบัตร
      </p>

      {hidden.length > 0 && (
        <div className="mt-3">
          <button className="text-xs text-ink-3 underline" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "ซ่อน" : `ดูกระเป๋าที่ซ่อนไว้ (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="mt-1 divide-y divide-line">
              {hidden.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2 text-ink-3">
                  <span className="flex-1">{w.name}</span>
                  <button className="pill text-xs" onClick={() => update.mutate({ id: w.id, patch: { archived: false } })}>แสดงอีกครั้ง</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function WalletForm({
  wallet, busy, canHide, onSave, onCancel,
}: {
  wallet: WalletDTO; busy: boolean; canHide: boolean;
  onSave: (patch: Parameters<typeof api.updateWallet>[1]) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(wallet.name);
  const [icon, setIcon] = useState(wallet.icon);
  const [balance, setBalance] = useState(showBaht(wallet.balance));
  const parsed = parseSignedBaht(balance);
  const patch = (): Parameters<typeof api.updateWallet>[1] => ({
    ...(name.trim() !== wallet.name && { name: name.trim() }),
    ...(icon !== wallet.icon && { icon }),
    ...(parsed !== null && parsed !== wallet.balance && { balance: parsed }),
  });
  return (
    <div className="flex flex-col gap-2">
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="ชื่อกระเป๋า" />
      <label className="flex items-center gap-2 text-sm text-ink-3">
        ยอดที่มีจริงตอนนี้ ฿
        <input
          className={`${input} flex-1`}
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(signedOnly(e.target.value))}
          aria-label="ยอดที่มีจริงตอนนี้ (บาท)"
        />
      </label>
      <WalletIconPicker value={icon} onChange={setIcon} />
      {!wallet.isDefault && (
        <button className="pill flex items-center justify-center gap-1 text-sm" disabled={busy} onClick={() => onSave({ ...patch(), isDefault: true })}>
          <Icon name="star" size={18} /> ใช้เป็นกระเป๋าหลัก (จดเข้ากระเป๋านี้ถ้าไม่ได้เลือก)
        </button>
      )}
      <div className="flex gap-2">
        {canHide && (
          <button className="btn3d key flex-1" style={{ ["--fg" as string]: "var(--expense)" }} disabled={busy} onClick={() => onSave({ archived: true })}>
            ซ่อน
          </button>
        )}
        <button className="btn3d key flex-1" onClick={onCancel}>ยกเลิก</button>
        <button className="btn3d flex-1" disabled={!name.trim() || parsed === null || busy} onClick={() => onSave(patch())}>บันทึก</button>
      </div>
      <p className="text-xs text-ink-3">ซ่อนแล้วจะไม่โผล่ให้เลือก แต่รายการเก่ายังอยู่ในกระเป๋านี้</p>
    </div>
  );
}
