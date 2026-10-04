"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "@/components/Feedback";
import type { ActivityDTO } from "./types";

const MILESTONES = [7, 30, 100];

/** Everything that should happen after the user presses log: refresh data, +XP burst, celebrations. */
export function useAfterLog() {
  const qc = useQueryClient();
  const fb = useFeedback();
  return (a: ActivityDTO) => {
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["breakdown"] });
    void qc.invalidateQueries({ queryKey: ["outstanding"] });
    void qc.invalidateQueries({ queryKey: ["wallets"] });
    fb.xp(a.xpGained);
    const firstOfDay = a.xpGained >= 10; // only the first log of a day moves the streak
    if (a.leveledUp) fb.celebrate({ title: "เลเวลอัป!", subtitle: "เก่งมาก จดต่อเนื่องแบบนี้เลย", icon: "military_tech" });
    else if (firstOfDay && MILESTONES.includes(a.streak))
      fb.celebrate({ title: `ไฟติด ${a.streak} วันแล้ว!`, subtitle: "ไม่ขาดสักวันเลย", icon: "local_fire_department" });
  };
}
