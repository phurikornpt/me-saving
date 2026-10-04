"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/client/api";
import { ICON_CHOICES } from "@/client/icons";
import { personColor } from "@/client/people";
import { useDashboard, usePeople, useWallets } from "@/client/queries";
import { walletOf } from "@/client/wallets";
import { formatBaht, parseBaht } from "@/domain/money";
import { useFeedback } from "../Feedback";
import { Icon } from "../Icon";
import { PeoplePicker } from "../People";
import { Sheet } from "../Sheet";
import { WalletPicker } from "../Wallets";
import { AddButton, emptyHint, IconPicker, inputClass, SettingsGroup, SettingsItem, SettingsPage } from "./ui";

/** One-tap presets shown on the dashboard. */
export function PresetsPage() {
  const qc = useQueryClient();
  const dash = useDashboard();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  const [adding, setAdding] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["dashboard"] });
  const remove = useMutation({ mutationFn: api.deletePreset, onSuccess: refresh });
  const presets = dash.data?.presets ?? [];

  return (
    <SettingsPage title="ปุ่มลัด" action={<AddButton label="เพิ่ม" onClick={() => setAdding(true)} />}>
      <SettingsGroup loading={dash.isPending} footer="แตะปุ่มลัดบน dashboard ครั้งเดียวก็จดเสร็จ">
        {presets.length === 0 && emptyHint("ยังไม่มีปุ่มลัด")}
        {presets.map((p) => (
          <SettingsItem
            key={p.id}
            icon={p.icon}
            title={p.label}
            summary={[
              `฿${formatBaht(p.amount)}`,
              p.personId ? `${p.splitKind === "equal" ? "หารกับ" : "ของ"}${people.find((x) => x.id === p.personId)?.name ?? ""}` : "",
              p.walletId ? (walletOf(wallets, p.walletId)?.name ?? "") : "",
            ].filter(Boolean).join(" · ")}
            trailing={
              <>
                {p.personId && <span style={{ color: personColor(people, p.personId) }}><Icon name="group" size={16} /></span>}
                <button aria-label={`ลบ ${p.label}`} className="rounded-full p-1 text-ink-3" onClick={() => remove.mutate(p.id)}>
                  <Icon name="delete" size={20} />
                </button>
              </>
            }
          />
        ))}
      </SettingsGroup>

      <Sheet open={adding} onOpenChange={setAdding} title="เพิ่มปุ่มลัด">
        {adding && (
          <PresetForm
            onDone={() => {
              setAdding(false);
              refresh();
            }}
          />
        )}
      </Sheet>
    </SettingsPage>
  );
}

function PresetForm({ onDone }: { onDone: () => void }) {
  const fb = useFeedback();
  const { data: people = [] } = usePeople();
  const { data: wallets = [] } = useWallets();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [icon, setIcon] = useState<string>(ICON_CHOICES[0]);
  const [mode, setMode] = useState<"" | "equal" | "theirs">("");
  const [person, setPerson] = useState<string | null>(null);
  // null = whatever the default wallet is when the preset is tapped
  const [wallet, setWallet] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      api.createPreset({
        label: label.trim(), icon, amount: parseBaht(amount), categoryId: null,
        personId: mode ? person : null, splitKind: mode || null, walletId: wallet,
      }),
    onSuccess: onDone,
    onError: () => fb.toast({ tone: "error", message: "เพิ่มไม่สำเร็จ ตรวจชื่อและจำนวนเงิน" }),
  });

  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="flex gap-2">
        <input className={inputClass} placeholder="ชื่อ เช่น BTS" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} aria-label="ชื่อปุ่มลัด" />
        <input
          className={`${inputClass} w-28`}
          inputMode="decimal"
          placeholder="บาท"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          aria-label="จำนวนเงิน (บาท)"
        />
      </div>
      <IconPicker choices={ICON_CHOICES} value={icon} onChange={setIcon} />
      <div className="flex flex-wrap gap-2">
        {([["", "ของเรา"], ["equal", "หารเท่ากัน"], ["theirs", "ของเขาทั้งหมด"]] as const).map(([k, t]) => (
          <button key={k} className="pill text-sm" aria-pressed={mode === k} onClick={() => setMode(k)}>{t}</button>
        ))}
      </div>
      {mode && <PeoplePicker people={people} selected={person ? [person] : []} onChange={([id]) => setPerson(id ?? null)} single label="กับใคร" />}
      <WalletPicker wallets={wallets} value={wallet} onChange={setWallet} label="จ่ายจากกระเป๋า" />
      <button className="btn3d" disabled={!label.trim() || !amount || (mode !== "" && !person) || add.isPending} onClick={() => add.mutate()}>
        เพิ่มปุ่มลัด
      </button>
    </div>
  );
}
