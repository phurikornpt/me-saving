"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SLOW_AFTER_MS } from "@/client/motion";
import { AuroraCloud } from "./AuroraCloud";

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

export type ReadingStage = "resize" | "ai";

/**
 * Shown while the AI reads a picture. The caption follows what is really happening (shrinking the photo,
 * then waiting for the AI), and says so when the wait runs long. No percentage: nothing real to measure.
 */
export function ReadingCloud({ stage, progress }: { stage: ReadingStage; progress?: string | null }) {
  const slow = useSlowAfter(SLOW_AFTER_MS, stage === "ai");
  return (
    <>
      <div className="aurora-in">
        <AuroraCloud mode="thinking" pulse={0} className="h-[260px] w-[260px]" />
      </div>
      <p className="-mt-2 text-ink-2" role="status">
        {stage === "resize" ? "กำลังย่อรูป…" : progress ? `AI กำลังอ่านรูปที่ ${progress}…` : "AI กำลังอ่านรูป…"}
      </p>
      <p className="mt-1 min-h-5 text-sm text-ink-3">{slow ? "ใช้เวลานานกว่าปกติ ยังรออยู่…" : ""}</p>
    </>
  );
}

/** true once `active` has been true for `ms` milliseconds; false again when it stops. */
function useSlowAfter(ms: number, active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [ms, active]);
  return slow;
}
