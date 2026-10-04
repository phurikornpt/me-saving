import { api } from "@/lib/http";
import { container } from "@/lib/container";
import { dashboardQuery } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (req, _ctx, me) => {
  const { wallet } = dashboardQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return container().forUser(me.userId).getDashboard.execute(wallet);
});
