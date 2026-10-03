import { api } from "@/lib/http";
import { container } from "@/lib/container";

export const runtime = "nodejs";

export const POST = api(async () => container().markNoSpendDay.execute());
