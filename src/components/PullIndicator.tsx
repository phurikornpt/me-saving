"use client";

import { PULL_THRESHOLD } from "@/client/pullToRefresh";
import { Icon } from "./Icon";
import { Spinner } from "./Loading";

/** The little bubble that follows the finger while pulling down to refresh. */
export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  if (pull === 0 && !refreshing) return null;
  const ready = pull >= PULL_THRESHOLD;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
      style={{ paddingTop: "env(safe-area-inset-top)", transform: `translateY(${pull - 40}px)` }}
      aria-live="polite"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-md">
        {refreshing ? (
          <Spinner />
        ) : (
          <span className="flex transition-transform" style={{ transform: `rotate(${ready ? 180 : 0}deg)` }}>
            <Icon name="arrow_downward" size={20} />
          </span>
        )}
      </div>
      <span className="sr-only">{refreshing ? "กำลังรีเฟรช" : ready ? "ปล่อยเพื่อรีเฟรช" : "ดึงลงเพื่อรีเฟรช"}</span>
    </div>
  );
}
