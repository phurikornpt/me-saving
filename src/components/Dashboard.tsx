"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { applyOptimisticNoSpend } from "@/client/optimistic";
import { useDashboard } from "@/client/queries";
import type { DashboardDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { wake } from "@/client/wake";
import type { WidgetId } from "@/domain/dashboard-layout";
import { EditLayoutSheet } from "./EditLayoutSheet";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { DashboardSkeleton } from "./Loading";
import { ModeWheel, type WheelSlot } from "./ModeWheel";
import { CalendarWidget } from "./widgets/CalendarWidget";
import { PartnerWidget } from "./widgets/PartnerWidget";
import { PresetsWidget } from "./widgets/PresetsWidget";
import { RecentWidget } from "./widgets/RecentWidget";
import { StreakWidget } from "./widgets/StreakWidget";
import { TodayWidget } from "./widgets/TodayWidget";

function renderWidget(id: WidgetId, data: DashboardDTO) {
  switch (id) {
    case "streak": return <StreakWidget data={data} />;
    case "partner": return <PartnerWidget data={data} />;
    case "presets": return <PresetsWidget data={data} />;
    case "today": return <TodayWidget data={data} />;
    case "calendar": return <CalendarWidget today={data.today} />;
    case "recent": return <RecentWidget data={data} />;
  }
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useDashboard();
  const router = useRouter();
  const fb = useFeedback();
  const afterLog = useAfterLog();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const noSpend = useMutation({
    mutationFn: api.noSpend,
    onMutate: () => applyOptimisticNoSpend(qc),
    onSuccess: (out) => {
      afterLog(out);
      fb.toast({ message: "วันนี้ไม่ได้ใช้เงิน นับเป็นวันที่จดแล้ว" });
    },
    onError: (_e, _v, rollback) => {
      rollback?.();
      fb.toast({ tone: "error", message: "บันทึกไม่สำเร็จ", action: { label: "ลองใหม่", run: () => noSpend.mutate() } });
    },
  });

  const slots: WheelSlot[] = [
    { id: "expense", icon: "payments", label: "รายจ่าย", tone: "text-expense" },
    { id: "income", icon: "savings", label: "รายรับ", tone: "text-income" },
    { id: "front", icon: "group", label: "ออกก่อนแฟน", tone: "text-partner" },
    { id: "repay", icon: "currency_exchange", label: "แฟนจ่ายคืน", tone: "text-partner", disabled: !data || data.partnerBalance === 0 },
    { id: "nospend", icon: "bedtime", label: "ไม่ได้ใช้เงิน", tone: "text-xp", disabled: !data || data.streak.loggedToday },
    { id: "scan", icon: "photo_camera", label: "สแกนใบเสร็จ", tone: "text-ink" },
  ];

  const pick = (id: string) => {
    if (id === "expense" || id === "income" || id === "front") router.push(`/new?mode=${id}`);
    else if (id === "repay") router.push("/repay");
    else if (id === "nospend") noSpend.mutate();
    // Mobile browsers only open a file picker from a real tap, which the wheel's pointer-up is not,
    // so the picker lives on /scan behind an ordinary button.
    else if (id === "scan") router.push("/scan");
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-36">
      <header className="safe-top flex items-center justify-between pb-3">
        <h1 className="font-display text-2xl">me-budget</h1>
        <div className="flex gap-1">
          <button aria-label="แก้ dashboard" className="rounded-full p-2" onClick={() => setEditing(true)}>
            <Icon name="tune" />
          </button>
          <Link aria-label="ตั้งค่า" href="/settings" className="rounded-full p-2">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      {data?.streak.atRisk && (
        <div className="mb-3 flex items-center gap-2 rounded-full bg-streak px-4 py-2 text-sm text-black" role="alert">
          <Icon name="local_fire_department" size={20} fill />
          ไฟ {data.streak.current} วันกำลังจะดับ! จดสักอย่างก่อนเที่ยงคืนนะ
        </div>
      )}

      {isLoading && <DashboardSkeleton />}
      {isError && !data && (
        <div className="py-20 text-center">
          <p className="mb-3 text-ink-2">โหลดข้อมูลไม่สำเร็จ</p>
          <button className="btn3d key" onClick={() => void refetch()}>ลองใหม่</button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {data?.layout.filter((w) => w.enabled).map((w) => <div key={w.id}>{renderWidget(w.id, data)}</div>)}
      </div>

      <ModeWheel
        slots={slots}
        onPress={wake}
        onTap={() => router.push("/new?mode=expense")}
        onPick={pick}
      />

      <EditLayoutSheet open={editing} layout={data?.layout ?? []} onOpenChange={setEditing} />
      {noSpend.isPending && <span className="sr-only">กำลังบันทึก</span>}
    </main>
  );
}
