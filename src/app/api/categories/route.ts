import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { categoryCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async () => container().manageCategories.list());
export const POST = api(async (req) =>
  Response.json(await container().manageCategories.create(await readJson(req, categoryCreateBody.parse)), { status: 201 }),
);
