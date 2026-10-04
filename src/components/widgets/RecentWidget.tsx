"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { readEntryLogged, subscribeEntryLogged } from "@/client/justLogged";
import { useCategories } from "@/client/queries";
import { isPendingEntry } from "@/client/optimistic";
import type { DashboardDTO, EntryDTO } from "@/client/types";
import { EditEntrySheet } from "../EditEntrySheet";
import { EntryRow } from "../EntryRow";
import { WidgetCard } from "./WidgetCard";

export function RecentWidget({ data }: { data: DashboardDTO }) {
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<EntryDTO | null>(null);
  const justLogged = useSyncExternalStore(subscribeEntryLogged, readEntryLogged, () => false);
  const newest = data.recent.find((e) => !isPendingEntry(e))?.id; // the row that was just saved
  // A saved entry replaces its "pending" row under a new id. That swap should not look like a second insert,
  // so rows that arrive when the last pending row is resolved skip their enter animation.
  const [prevRecent, setPrevRecent] = useState(data.recent);
  const [skipEnter, setSkipEnter] = useState<ReadonlySet<string>>(new Set());
  if (prevRecent !== data.recent) {
    setPrevRecent(data.recent);
    const resolved = prevRecent.some(isPendingEntry) && !data.recent.some(isPendingEntry);
    setSkipEnter(new Set(resolved ? data.recent.map((e) => e.id) : []));
  }
  return (
    <WidgetCard title="รายการล่าสุด">
      {data.recent.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">ยังไม่มีรายการ กด + เพื่อจดอันแรก</p>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {data.recent.map((e) => (
              <motion.li
                key={e.id}
                layout="position"
                initial={skipEnter.has(e.id) ? false : { opacity: 0, height: 0, y: -12 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={isPendingEntry(e) ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, x: 40 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className={`overflow-hidden rounded-xl ${justLogged && e.id === newest ? "fresh-row" : ""}`}
              >
                <EntryRow entry={e} categories={categories} onClick={isPendingEntry(e) ? undefined : () => setEditing(e)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </WidgetCard>
  );
}
