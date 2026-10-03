import { ZodError } from "zod";
import { DomainError, type DomainErrorCode } from "@/domain/errors";
import { auth } from "./auth";

const STATUS: Record<DomainErrorCode, number> = {
  INVALID_AMOUNT: 422,
  INVALID_SPLIT: 422,
  INVALID_RECEIPT: 422,
  REPAYMENT_EXCEEDS_BALANCE: 409,
  BALANCE_WOULD_GO_NEGATIVE: 409,
  ENTRY_LOCKED: 409,
  NO_SPEND_ALREADY_LOGGED: 409,
  RECEIPT_TOTAL_MISMATCH: 422,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
};

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const errorBody = (code: string, message: string) => ({ error: { code, message } });

/**
 * Controller wrapper: session check first, then the handler, then one place that turns
 * errors into HTTP. Clients get a stable `code`; unexpected errors never leak details.
 */
export function api<Ctx = unknown>(handler: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    if (!(await auth())) return json(errorBody("UNAUTHORIZED", "login required"), 401);
    try {
      const out = await handler(req, ctx);
      if (out instanceof Response) return out;
      return out === undefined ? new Response(null, { status: 204 }) : json(out);
    } catch (e) {
      if (e instanceof DomainError) return json(errorBody(e.code, e.message), STATUS[e.code] ?? 422);
      if (e instanceof ZodError) return json(errorBody("BAD_REQUEST", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), 400);
      if (e instanceof SyntaxError) return json(errorBody("BAD_REQUEST", "invalid JSON"), 400);
      console.error("[api]", e);
      return json(errorBody("INTERNAL", "something went wrong"), 500);
    }
  };
}

export async function readJson<T>(req: Request, parse: (raw: unknown) => T): Promise<T> {
  return parse(await req.json());
}
