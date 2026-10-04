import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { backfillBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const POST = api(async (req, _ctx, me) => {
  const body = await readJson(req, backfillBody.parse);
  const out = await container().forUser(me.userId).recordBackfill.execute(body);
  return Response.json(out, { status: 201 });
});
