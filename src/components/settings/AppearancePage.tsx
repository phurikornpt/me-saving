"use client";

import { useSyncExternalStore } from "react";
import { readTheme, setTheme, subscribeTheme, type ThemePref } from "@/client/theme";
import { SettingsGroup, SettingsPage } from "./ui";

/** Theme is remembered per device (localStorage), not per account. */
export function AppearancePage() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): ThemePref => "system");
  return (
    <SettingsPage title="หน้าตา">
      <SettingsGroup title="ธีม" footer="ตั้งไว้เฉพาะเครื่องนี้">
        <div className="flex gap-2 py-3">
          {([["system", "ตามระบบ"], ["light", "สว่าง"], ["dark", "มืด"]] as const).map(([k, label]) => (
            <button key={k} className="pill flex-1" aria-pressed={theme === k} onClick={() => setTheme(k)}>
              {label}
            </button>
          ))}
        </div>
      </SettingsGroup>
    </SettingsPage>
  );
}
