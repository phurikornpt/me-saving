"use client";

import { useRouter } from "next/navigation";
import { useDashboard } from "@/client/queries";
import { LayoutEditor } from "../EditLayoutSheet";
import { SettingsPage } from "./ui";

/** Which widgets the dashboard shows and in what order. Same editor as the dashboard's tune button. */
export function DashboardPage() {
  const router = useRouter();
  const { data } = useDashboard();
  return (
    <SettingsPage title="Dashboard">
      {data ? (
        <div className="rounded-[24px] bg-card p-4">
          <LayoutEditor layout={data.layout} onDone={() => router.push("/settings")} />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-ink-3">กำลังโหลด…</p>
      )}
    </SettingsPage>
  );
}
