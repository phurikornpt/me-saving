import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { personPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// No DELETE: people are archived (hidden), so old entries keep their name.
export const PATCH = api<Ctx>(async (req, { params }, me) => {
  const { id } = await params;
  return container().forUser(me.userId).managePeople.update(id, await readJson(req, personPatchBody.parse));
});
