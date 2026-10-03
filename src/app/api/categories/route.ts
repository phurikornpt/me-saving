import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { categoryCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).manageCategories.list());
export const POST = api(async (req, _ctx, me) =>
  Response.json(await container().forUser(me.userId).manageCategories.create(await readJson(req, categoryCreateBody.parse)), { status: 201 }),
);
