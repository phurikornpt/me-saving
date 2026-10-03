import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { saveReceiptBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const POST = api(async (req) => {
  const body = await readJson(req, saveReceiptBody.parse);
  return Response.json(await container().saveReceiptEntry.execute(body), { status: 201 });
});
