import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { presetCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async () => container().managePresets.list());
export const POST = api(async (req) =>
  Response.json(await container().managePresets.create(await readJson(req, presetCreateBody.parse)), { status: 201 }),
);
