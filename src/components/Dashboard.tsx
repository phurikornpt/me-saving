"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { introPlaying } from "@/client/intro";
import { applyOptimisticNoSpend } from "@/client/optimistic";
import { useDashboard } from "@/client/queries";
import { setWalletFilter, useWalletFilter } from "@/client/walletFilter";
import type { DashboardDTO } from "@/client/types";
import { useAfterLog } from "@/client/useAfterLog";
import { wake } from "@/client/wake";
import type { WidgetId } from "@/domain/dashboard-layout";
import { EditLayoutSheet } from "./EditLayoutSheet";
import { useFeedback } from "./Feedback";
import { Icon } from "./Icon";
import { DashboardSkeleton } from "./Loading";
import { ModeWheel, type WheelSlot } from "./ModeWheel";
import { CategorySummaryWidget } from "./widgets/CategorySummaryWidget";
import { CalendarWidget } from "./widgets/CalendarWidget";
import { PeopleWidget } from "./widgets/PeopleWidget";
import { PresetsWidget } from "./widgets/PresetsWidget";
import { RecentWidget } from "./widgets/RecentWidget";
import { StreakWidget } from "./widgets/StreakWidget";
import { TodayWidget } from "./widgets/TodayWidget";
import { WalletsWidget } from "./widgets/WalletsWidget";

function renderWidget(id: WidgetId, data: DashboardDTO) {
  switch (id) {
    case "streak": return <StreakWidget data={data} />;
    case "people": return <PeopleWidget data={data} />;
    case "wallets": return <WalletsWidget data={data} />;
    case "presets": return <PresetsWidget data={data} />;
    case "today": return <TodayWidget data={data} />;
    case "calendar": return <CalendarWidget today={data.today} />;
    case "summary": return <CategorySummaryWidget today={data.today} />;
    case "recent": return <RecentWidget data={data} />;
  }
}

export function Dashboard() {
  const base = useDashboard();
  const { isLoading, isError, refetch } = base;
  // A wallet picked on this device narrows the money views (today, recent, calendar, categories).
  const stored = useWalletFilter();
  const activeWallets = (base.data?.wallets ?? []).filter((w) => !w.archived);
  const wallet = stored && activeWallets.some((w) => w.id === stored) ? stored : null;
  useEffect(() => {
    // the remembered wallet was archived (or belongs to another account): back to every wallet
    if (stored && base.data && !wallet) setWalletFilter(null);
  }, [stored, base.data, wallet]);
  const filtered = useDashboard(wallet);
  const data = base.data && wallet && filtered.data
    ? { ...base.data, todayTotals: filtered.data.todayTotals, recent: filtered.data.recent }
    : base.data;
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
    {
      id: "expense", icon: "payments", label: "รายจ่าย", tone: "text-expense",
      // drag on past รายจ่าย for a group of items, each with its own owner
      outer: { id: "itemized", icon: "list_alt", label: "หลายรายการ", tone: "text-expense" },
    },
    { id: "income", icon: "savings", label: "รายรับ", tone: "text-income" },
    { id: "front", icon: "group", label: "ออกก่อน", tone: "text-partner" },
    { id: "repay", icon: "currency_exchange", label: "รับเงินคืน", tone: "text-partner", disabled: !data?.balances.some((b) => b.balance > 0) },
    { id: "nospend", icon: "bedtime", label: "ไม่ได้ใช้เงิน", tone: "text-xp", disabled: !data || data.streak.loggedToday },
    { id: "scan", icon: "photo_camera", label: "สแกน", tone: "text-ink" },
  ];

  const pick = (id: string) => {
    if (id === "expense" || id === "income" || id === "front") router.push(`/new?mode=${id}`);
    else if (id === "itemized") router.push("/itemized");
    else if (id === "repay") router.push("/repay");
    else if (id === "nospend") noSpend.mutate();
    // Mobile browsers only open a file picker from a real tap, which the wheel's pointer-up is not,
    // so the picker lives on /scan behind an ordinary button.
    else if (id === "scan") router.push("/scan");
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-36">
      <header className="intro-rise safe-top flex items-center justify-between pb-3">
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

      {isLoading && <div className="intro-rise"><DashboardSkeleton /></div>}
      {isError && !data && (
        <div className="py-20 text-center">
          <p className="mb-3 text-ink-2">โหลดข้อมูลไม่สำเร็จ</p>
          <button className="btn3d key" onClick={() => void refetch()}>ลองใหม่</button>
        </div>
      )}

      {activeWallets.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="ดูตามกระเป๋า">
          <button className="pill shrink-0 text-sm" aria-pressed={wallet === null} onClick={() => setWalletFilter(null)}>
            ทุกกระเป๋า
          </button>
          {activeWallets.map((w) => (
            <button key={w.id} className="pill flex shrink-0 items-center gap-1 text-sm" aria-pressed={wallet === w.id} onClick={() => setWalletFilter(w.id)}>
              <Icon name={w.icon} size={16} /> {w.name}
            </button>
          ))}
        </div>
      )}

      <div className={`flex flex-col gap-3 transition-opacity ${wallet && filtered.isPlaceholderData ? "opacity-60" : ""}`}>
        {data?.layout.filter((w) => w.enabled).map((w, i) => (
          // Rise in one by one only while the intro plays; `initial` is read at mount, so refetches never replay it.
          <motion.div
            key={w.id}
            initial={introPlaying() ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.45 + i * 0.05 }}
          >
            {renderWidget(w.id, data)}
          </motion.div>
        ))}
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
