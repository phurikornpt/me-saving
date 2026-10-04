"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { WALLET_ICON_CHOICES } from "@/client/icons";
import { useWallets } from "@/client/queries";
import type { WalletDTO } from "@/client/types";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "../Feedback";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { AddButton, IconPicker, inputClass, SettingsGroup, SettingsItem, SettingsPage } from "./ui";

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
const money = (s: number) => `${s < 0 ? "-" : ""}฿${formatBaht(Math.abs(s))}`;

type Editing = WalletDTO | "new" | null;

/** Wallets: name, icon, what is really in each now, which one is the default. Hidden, never deleted. */
export function WalletsPage() {
  const qc = useQueryClient();
  const fb = useFeedback();
  const { data, isPending } = useWallets();
  const wallets = data ?? [];
  const [editing, setEditing] = useState<Editing>(null);
  const [showHidden, setShowHidden] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["wallets"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const unhide = useMutation({
    mutationFn: (id: string) => api.updateWallet(id, { archived: false }),
    onSuccess: refresh,
    onError: () => fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ" }),
  });

  const active = wallets.filter((w) => !w.archived);
  const hidden = wallets.filter((w) => w.archived);

  return (
    <SettingsPage title="กระเป๋าเงิน" action={<AddButton label="เพิ่ม" onClick={() => setEditing("new")} />}>
      <SettingsGroup
        loading={isPending}
        footer={'ยอดคิดจากยอดตั้งต้นบวกลบรายการที่จด ถ้าไม่ตรงกับเงินจริง แตะกระเป๋าแล้วใส่ยอดที่มีจริงตอนนี้ จ่ายบิลบัตรให้ใช้ "โอน" จากธนาคารไปบัตร'}
      >
        {active.map((w) => (
          <SettingsItem
            key={w.id}
            icon={w.icon}
            title={w.isDefault ? `${w.name} · กระเป๋าหลัก` : w.name}
            summary={`ยอดตอนนี้ ${money(w.balance)}`}
            summaryTone={w.balance < 0 ? "text-expense" : undefined}
            onClick={() => setEditing(w)}
          />
        ))}
      </SettingsGroup>

      {hidden.length > 0 && (
        <div>
          <button className="px-2 text-xs text-ink-3 underline" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "ซ่อนรายการที่ซ่อนไว้" : `ดูกระเป๋าที่ซ่อนไว้ (${hidden.length})`}
          </button>
          {showHidden && (
            <div className="mt-1">
              <SettingsGroup>
                {hidden.map((w) => (
                  <SettingsItem
                    key={w.id}
                    icon={w.icon}
                    title={w.name}
                    trailing={<button className="pill !py-1 text-xs" onClick={() => unhide.mutate(w.id)}>แสดงอีกครั้ง</button>}
                  />
                ))}
              </SettingsGroup>
            </div>
          )}
        </div>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "เพิ่มกระเป๋า" : "แก้กระเป๋า"}>
        {editing && (
          <WalletForm
            key={editing === "new" ? "new" : editing.id}
            wallet={editing === "new" ? null : editing}
            canHide={active.length > 1}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Sheet>
    </SettingsPage>
  );
}

function WalletForm({ wallet, canHide, onDone }: { wallet: WalletDTO | null; canHide: boolean; onDone: () => void }) {
  const fb = useFeedback();
  const [name, setName] = useState(wallet?.name ?? "");
  const [icon, setIcon] = useState<string>(wallet?.icon ?? WALLET_ICON_CHOICES[1]);
  const [balance, setBalance] = useState(wallet ? showBaht(wallet.balance) : "");
  const parsed = balance === "" && !wallet ? 0 : parseSignedBaht(balance);

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateWallet>[1]) =>
      wallet ? api.updateWallet(wallet.id, patch) : api.createWallet({ name: name.trim(), icon, balance: parsed ?? 0 }),
    onSuccess: onDone,
    onError: (e) =>
      fb.toast({ tone: "error", message: (e as ApiError).code === "LAST_WALLET" ? "ต้องเหลือกระเป๋าอย่างน้อย 1 ใบ" : "บันทึกไม่สำเร็จ ตรวจชื่อและยอด" }),
  });

  const patch = (): Parameters<typeof api.updateWallet>[1] => ({
    ...(wallet && name.trim() !== wallet.name && { name: name.trim() }),
    ...(wallet && icon !== wallet.icon && { icon }),
    ...(wallet && parsed !== null && parsed !== wallet.balance && { balance: parsed }),
  });

  return (
    <div className="flex flex-col gap-3 pb-2">
      <input className={inputClass} placeholder="ชื่อ เช่น ธนาคาร, บัตรเครดิต" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="ชื่อกระเป๋า" />
      <label className="flex items-center gap-2 text-sm text-ink-3">
        {wallet ? "ยอดที่มีจริงตอนนี้" : "ยอดตอนนี้"} ฿
        <input
          className={`${inputClass} flex-1`}
          inputMode="decimal"
          placeholder="0 (บัตรเครดิตใส่ติดลบได้)"
          value={balance}
          onChange={(e) => setBalance(signedOnly(e.target.value))}
          aria-label="ยอดเงิน (บาท)"
        />
      </label>
      <IconPicker choices={WALLET_ICON_CHOICES} value={icon} onChange={setIcon} />
      {wallet && !wallet.isDefault && (
        <button className="pill flex items-center justify-center gap-1 text-sm" disabled={save.isPending} onClick={() => save.mutate({ ...patch(), isDefault: true })}>
          <Icon name="star" size={18} /> ใช้เป็นกระเป๋าหลัก
        </button>
      )}
      <div className="flex gap-2">
        {wallet && canHide && (
          <button className="btn3d key flex-1" style={{ ["--fg" as string]: "var(--expense)" }} disabled={save.isPending} onClick={() => save.mutate({ archived: true })}>
            ซ่อน
          </button>
        )}
        <button className="btn3d flex-1" disabled={!name.trim() || parsed === null || save.isPending} onClick={() => save.mutate(patch())}>
          {wallet ? "บันทึก" : "เพิ่มกระเป๋า"}
        </button>
      </div>
      {wallet && <p className="text-xs text-ink-3">ซ่อนแล้วจะไม่โผล่ให้เลือก แต่รายการเก่ายังอยู่ในกระเป๋านี้</p>}
    </div>
  );
}
