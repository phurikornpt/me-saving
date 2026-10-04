import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { backfillCheckBody } from "@/lib/schemas";

export const runtime = "nodejs";

/** Which of these rows look like entries we already have. No AI, no quota. */
export const POST = api(async (req, _ctx, me) => {
  const { rows } = await readJson(req, backfillCheckBody.parse);
  return { duplicates: await container().forUser(me.userId).findDuplicates.execute(rows) };
});
