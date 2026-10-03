import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { personCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async () => container().managePeople.list());
export const POST = api(async (req) =>
  Response.json(await container().managePeople.create(await readJson(req, personCreateBody.parse)), { status: 201 }),
);
