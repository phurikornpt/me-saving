"use client";

import { useState } from "react";
import { useCategories } from "@/client/queries";
import type { DashboardDTO, EntryDTO } from "@/client/types";
import { EditEntrySheet } from "../EditEntrySheet";
import { EntryRow } from "../EntryRow";
import { WidgetCard } from "./WidgetCard";

export function RecentWidget({ data }: { data: DashboardDTO }) {
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<EntryDTO | null>(null);
  return (
    <WidgetCard title="รายการล่าสุด">
      {data.recent.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">ยังไม่มีรายการ กด + เพื่อจดอันแรก</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.recent.map((e) => (
            <li key={e.id}>
              <EntryRow entry={e} categories={categories} onClick={() => setEditing(e)} />
            </li>
          ))}
        </ul>
      )}
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </WidgetCard>
  );
}
