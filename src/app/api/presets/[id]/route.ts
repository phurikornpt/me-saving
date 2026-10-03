import { DomainError } from "@/domain/errors";
import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { presetPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, { params }, me) => {
  const { id } = await params;
  const out = await container().forUser(me.userId).managePresets.update(id, await readJson(req, presetPatchBody.parse));
  if (!out) throw new DomainError("NOT_FOUND", "preset not found");
  return out;
});

export const DELETE = api<Ctx>(async (_req, { params }, me) => {
  if (!(await container().forUser(me.userId).managePresets.remove((await params).id))) throw new DomainError("NOT_FOUND", "preset not found");
});
