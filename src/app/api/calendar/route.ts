import { api } from "@/lib/http";
import { container } from "@/lib/container";
import { calendarQuery } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (req, _ctx, me) => {
  const { month } = calendarQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return container().forUser(me.userId).getCalendarMonth.execute(month);
});
