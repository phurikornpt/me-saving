import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { parseEntryBody } from "@/lib/schemas";

export const runtime = "nodejs";
// Gemini can take several seconds; the default function limit would cut it off.
export const maxDuration = 30;

// The sentence is read, sent to the model and dropped. The result is only a draft: nothing is saved here.
export const POST = api(async (req, _ctx, me) => {
  const { text } = await readJson(req, parseEntryBody.parse);
  return container().forUser(me.userId).parseEntryText().execute(text);
});
