import type { DashboardDTO } from "@/client/types";
import { formatBaht } from "@/domain/money";
import { AnimatedNumber } from "../AnimatedNumber";
import { WidgetCard } from "./WidgetCard";

const baht = (satang: number) => `฿${formatBaht(satang)}`;

export function TodayWidget({ data }: { data: DashboardDTO }) {
  return (
    <WidgetCard title="วันนี้">
      <div className="flex gap-6">
        <div>
          <div className="text-xs text-ink-3">ใช้ไป (ของเรา)</div>
          <div className="font-bold text-2xl text-expense"><AnimatedNumber value={data.todayTotals.spent} format={baht} /></div>
        </div>
        <div>
          <div className="text-xs text-ink-3">รับมา</div>
          <div className="font-bold text-2xl text-income"><AnimatedNumber value={data.todayTotals.earned} format={baht} /></div>
        </div>
      </div>
    </WidgetCard>
  );
}
