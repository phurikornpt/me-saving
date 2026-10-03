import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { presetCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).managePresets.list());
export const POST = api(async (req, _ctx, me) =>
  Response.json(await container().forUser(me.userId).managePresets.create(await readJson(req, presetCreateBody.parse)), { status: 201 }),
);
