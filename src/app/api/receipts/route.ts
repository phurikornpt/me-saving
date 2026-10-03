import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { saveReceiptBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const POST = api(async (req, _ctx, me) => {
  const body = await readJson(req, saveReceiptBody.parse);
  return Response.json(await container().forUser(me.userId).saveReceiptEntry.execute(body), { status: 201 });
});
