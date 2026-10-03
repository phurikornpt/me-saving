import { api } from "@/lib/http";
import { container } from "@/lib/container";

export const runtime = "nodejs";

export const GET = api(async () => container().getPartnerOutstanding.execute());
