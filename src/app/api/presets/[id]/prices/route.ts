import { DomainError } from "@/domain/errors";
import { api } from "@/lib/http";
import { container } from "@/lib/container";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** The prices this preset was logged at lately, most used first (for the hold-to-pick popup). */
export const GET = api<Ctx>(async (_req, { params }, me) => {
  const out = await container().forUser(me.userId).managePresets.prices((await params).id, new Date());
  if (!out) throw new DomainError("NOT_FOUND", "preset not found");
  return out;
});
