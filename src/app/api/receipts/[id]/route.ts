import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { updateGroupBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Replaces a group's lines (receipt or hand-typed). Refused once someone paid part of it back. */
export const PUT = api<Ctx>(async (req, { params }, me) => {
  const { id } = await params;
  return container().forUser(me.userId).updateGroupEntry.execute(id, await readJson(req, updateGroupBody.parse));
});
