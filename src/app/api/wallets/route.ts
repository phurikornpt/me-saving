import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { walletCreateBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).manageWallets.list());
export const POST = api(async (req, _ctx, me) =>
  Response.json(await container().forUser(me.userId).manageWallets.create(await readJson(req, walletCreateBody.parse)), { status: 201 }),
);
