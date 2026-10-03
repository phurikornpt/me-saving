import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { listEntriesQuery, recordEntryBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (req, _ctx, me) => {
  const q = listEntriesQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return container().forUser(me.userId).listEntries.execute(q);
});

export const POST = api(async (req, _ctx, me) => {
  const body = await readJson(req, recordEntryBody.parse);
  const out = await container().forUser(me.userId).recordEntry.execute(body);
  return Response.json(out, { status: 201 });
});
