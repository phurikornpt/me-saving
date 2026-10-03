import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { WidgetCard } from "./WidgetCard";

export function TodayWidget({ data }: { data: DashboardDTO }) {
  return (
    <WidgetCard title="วันนี้">
      <div className="flex gap-6">
        <div>
          <div className="text-xs text-ink-3">ใช้ไป (ของเรา)</div>
          <div className="font-bold text-2xl text-expense">฿{formatBaht(data.todayTotals.spent)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-3">รับมา</div>
          <div className="font-bold text-2xl text-income">฿{formatBaht(data.todayTotals.earned)}</div>
        </div>
      </div>
    </WidgetCard>
  );
}
