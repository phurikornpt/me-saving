import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { settingsPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async (_req, _ctx, me) => container().forUser(me.userId).manageSettings.get());
export const PATCH = api(async (req, _ctx, me) => container().forUser(me.userId).manageSettings.update(await readJson(req, settingsPatchBody.parse)));
