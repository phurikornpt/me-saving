"use client";

import { useRouter } from "next/navigation";
import { useDashboard } from "@/client/queries";
import { LayoutEditor } from "../EditLayoutSheet";
import { Skeleton } from "../Loading";
import { SettingsPage } from "./ui";

/** Which widgets the dashboard shows and in what order. Same editor as the dashboard's tune button. */
export function DashboardPage() {
  const router = useRouter();
  const { data } = useDashboard();
  return (
    <SettingsPage title="Dashboard">
      {data ? (
        <div className="fade-in rounded-[24px] bg-card p-4">
          <LayoutEditor layout={data.layout} onDone={() => router.replace("/settings")} />
        </div>
      ) : (
        <div className="rounded-[24px] bg-card p-4" aria-busy="true" aria-label="กำลังโหลด">
          <Skeleton className="mb-3 h-10 w-full" /><Skeleton className="mb-3 h-10 w-full" /><Skeleton className="h-10 w-full" />
        </div>
      )}
    </SettingsPage>
  );
}
