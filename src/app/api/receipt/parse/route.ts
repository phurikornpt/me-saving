import { DomainError } from "@/domain/errors";
import { api } from "@/lib/http";
import { container } from "@/lib/container";
import { parsePeopleField } from "@/lib/schemas";

export const runtime = "nodejs";
// Gemini can take several seconds; the default function limit would cut it off.
export const maxDuration = 30;

// The image is read, sent to the model and dropped: it is never stored.
// Optional field `people` (comma-separated ids): who shares the bill. None = just read the lines.
export const POST = api(async (req, _ctx, me) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) throw new DomainError("INVALID_RECEIPT", "send the picture as multipart field 'image'");
  return container().forUser(me.userId).parseReceipt().execute(
    { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type },
    parsePeopleField(form?.get("people")),
  );
});
