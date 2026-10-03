"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      style={{ width: size, height: size }}
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** Placeholder cards the size of the real widgets, shown until the first dashboard response. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="กำลังโหลด">
      <div className="rounded-[24px] bg-card p-4"><Skeleton className="mb-3 h-4 w-24" /><Skeleton className="h-14 w-full" /></div>
      <div className="rounded-[24px] bg-card p-4"><Skeleton className="mb-3 h-4 w-32" /><div className="flex gap-2"><Skeleton className="h-9 w-24 !rounded-full" /><Skeleton className="h-9 w-28 !rounded-full" /><Skeleton className="h-9 w-24 !rounded-full" /></div></div>
      <div className="rounded-[24px] bg-card p-4"><Skeleton className="mb-3 h-4 w-16" /><div className="flex gap-6"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div></div>
      <div className="rounded-[24px] bg-card p-4"><Skeleton className="mb-3 h-4 w-28" /><Skeleton className="mb-2 h-10 w-full" /><Skeleton className="mb-2 h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
    </div>
  );
}

/** Thin indeterminate bar at the top while anything is fetching or saving. Waits 250ms so quick calls don't flash it. */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setShow(true), 250);
    return () => {
      clearTimeout(t);
      setShow(false);
    };
  }, [busy]);
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
      <div className="top-progress-bar h-full w-1/3 rounded-full bg-primary" style={{ animation: "top-progress 1.1s ease-in-out infinite" }} />
    </div>
  );
}

const READING_STEPS = ["กำลังส่งรูป…", "กำลังอ่านรายการ…", "กำลังจัดหมวดและแบ่งเจ้าของ…", "ใกล้เสร็จแล้ว…"];

/** Receipt with a scan line sweeping over it; the caption advances so a long AI call doesn't feel stuck. */
export function ReadingReceipt() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, READING_STEPS.length - 1)), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="relative flex h-32 w-24 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-[0_4px_0_var(--line)]">
        <Icon name="receipt_long" size={56} className="text-ink-3" />
        <div className="scan-line absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_8px_var(--primary)]" style={{ animation: "scan-line 1.8s ease-in-out infinite" }} />
      </div>
      <p className="mt-4 text-ink-2" role="status">{READING_STEPS[step]}</p>
    </>
  );
}
