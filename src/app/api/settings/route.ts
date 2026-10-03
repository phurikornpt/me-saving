import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { settingsPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = api(async () => container().manageSettings.get());
export const PATCH = api(async (req) => container().manageSettings.update(await readJson(req, settingsPatchBody.parse)));
