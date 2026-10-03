import { DomainError } from "@/domain/errors";
import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { categoryPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const out = await container().manageCategories.update(id, await readJson(req, categoryPatchBody.parse));
  if (!out) throw new DomainError("NOT_FOUND", "category not found");
  return out;
});

// "Delete" archives: old entries keep their category label.
export const DELETE = api<Ctx>(async (_req, { params }) => {
  const out = await container().manageCategories.archive((await params).id);
  if (!out) throw new DomainError("NOT_FOUND", "category not found");
});
