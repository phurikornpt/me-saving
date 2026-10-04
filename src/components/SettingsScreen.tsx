"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useCategories, useDashboard, usePeople, useWallets } from "@/client/queries";
import { readTheme, subscribeTheme, type ThemePref } from "@/client/theme";
import { activeWallets } from "@/client/wallets";
import { formatBaht } from "@/domain/money";
import { Icon } from "./Icon";
import { SettingsGroup, SettingsLink } from "./settings/ui";

const THEME_NAME: Record<ThemePref, string> = { system: "ตามระบบ", light: "สว่าง", dark: "มืด" };

/** The settings home: a short list of topics, each opening its own page. Summaries show what's inside. */
export function SettingsScreen({ logout }: { logout: () => Promise<void> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const dash = useDashboard();
  const { data: categories } = useCategories();
  const { data: people } = usePeople();
  const { data: wallets } = useWallets();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): ThemePref => "system");
  const [loggingOut, setLoggingOut] = useState(false);

  const activeW = wallets ? activeWallets(wallets) : null;
  const total = activeW?.reduce((s, w) => s + w.balance, 0) ?? 0;
  const activePeople = people?.filter((p) => !p.archived);
  const layout = dash.data?.layout;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="safe-top flex items-center gap-2 pb-3">
        <button className="rounded-full p-2" aria-label="กลับ" onClick={() => router.replace("/")}>
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-display text-xl">ตั้งค่า</h1>
      </header>

      <div className="flex flex-col gap-4">
        <SettingsGroup title="เงิน">
          <SettingsLink
            href="/settings/wallets"
            icon="account_balance_wallet"
            title="กระเป๋าเงิน"
            summary={activeW ? `${activeW.length} ใบ · รวม ${total < 0 ? "-" : ""}฿${formatBaht(Math.abs(total))}` : undefined}
          />
          <SettingsLink
            href="/settings/categories"
            icon="receipt"
            title="หมวดหมู่"
            summary={categories ? `${categories.filter((c) => !c.archived).length} หมวด` : undefined}
          />
          <SettingsLink
            href="/settings/presets"
            icon="bolt"
            title="ปุ่มลัด"
            summary={dash.data ? `${dash.data.presets.length} ปุ่ม` : undefined}
          />
        </SettingsGroup>

        <SettingsGroup title="คน">
          <SettingsLink
            href="/settings/people"
            icon="group"
            title="คนที่หารด้วย"
            summary={activePeople ? (activePeople.length ? activePeople.map((p) => p.name).join(", ") : "ยังไม่มีใคร") : undefined}
          />
        </SettingsGroup>

        <SettingsGroup title="แอป">
          <SettingsLink href="/settings/dashboard" icon="tune" title="Dashboard" summary={layout ? `เปิด ${layout.filter((w) => w.enabled).length} จาก ${layout.length} widget` : undefined} />
          <SettingsLink href="/settings/appearance" icon="settings" title="หน้าตา" summary={`ธีม${THEME_NAME[theme]}`} />
        </SettingsGroup>

        <button
          className="btn3d key mt-2"
          style={{ ["--fg" as string]: "var(--expense)" }}
          disabled={loggingOut}
          onClick={() => {
            setLoggingOut(true);
            qc.clear();
            try { window.localStorage.removeItem("me-budget-cache"); } catch { /* ignore */ }
            void logout();
          }}
        >
          <Icon name="logout" size={20} /> ออกจากระบบ
        </button>
      </div>
    </main>
  );
}
