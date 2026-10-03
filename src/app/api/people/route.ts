import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { personCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).managePeople.list());
export const POST = api(async (req, _ctx, me) =>
  Response.json(await container().forUser(me.userId).managePeople.create(await readJson(req, personCreateBody.parse)), { status: 201 }),
);
