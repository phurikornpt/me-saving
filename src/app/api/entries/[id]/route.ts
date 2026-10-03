import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { updateEntryBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, { params }) => {
  const { id } = await params;
  return container().updateEntry.execute(id, await readJson(req, updateEntryBody.parse));
});

export const DELETE = api<Ctx>(async (_req, { params }) => {
  await container().deleteEntry.execute((await params).id);
});
