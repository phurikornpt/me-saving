"use client";

import { useSyncExternalStore } from "react";
import { useMotionPref } from "@/client/motionPref";
import { setMotionPref } from "@/client/motionPref";
import { readTheme, setTheme, subscribeTheme, type ThemePref } from "@/client/theme";
import { SettingsGroup, SettingsPage } from "./ui";

/** Theme is remembered per device (localStorage), not per account. */
export function AppearancePage() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): ThemePref => "system");
  const motion = useMotionPref();
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
      <SettingsGroup
        title="การเคลื่อนไหว"
        footer="ตั้งไว้เฉพาะเครื่องนี้ ปิดก้อนเมฆที่ขยับ และเอฟเฟกต์ที่เด้ง ข้อมูลยังเปลี่ยนเหมือนเดิม ถ้าระบบของเครื่องตั้งให้ลดการเคลื่อนไหวอยู่แล้ว แอปจะลดตามเสมอ"
      >
        <label className="flex items-center justify-between gap-3 py-3">
          <span>ลดการเคลื่อนไหว</span>
          <input
            type="checkbox"
            role="switch"
            className="size-6"
            checked={motion === "reduce"}
            onChange={(e) => setMotionPref(e.target.checked ? "reduce" : "system")}
          />
        </label>
      </SettingsGroup>
    </SettingsPage>
  );
}
