import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { updateEntryBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, { params }, me) => {
  const { id } = await params;
  return container().forUser(me.userId).updateEntry.execute(id, await readJson(req, updateEntryBody.parse));
});

export const DELETE = api<Ctx>(async (_req, { params }, me) => {
  await container().forUser(me.userId).deleteEntry.execute((await params).id);
});
