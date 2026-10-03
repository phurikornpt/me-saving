import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { repaymentBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const POST = api(async (req) => {
  const body = await readJson(req, repaymentBody.parse);
  return Response.json(await container().recordRepayment.execute({ amount: body.amount, note: body.note }), { status: 201 });
});
