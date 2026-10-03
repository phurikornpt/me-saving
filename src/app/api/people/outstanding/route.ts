import { api } from "@/lib/http";
import { container } from "@/lib/container";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).getOutstanding.execute());
