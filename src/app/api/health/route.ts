import { getSequelize } from "@/infrastructure/db/sequelize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "AUTH_EMAIL", "AUTH_PASSWORD_HASH", "GEMINI_API_KEY"] as const;

/**
 * Public on purpose, for debugging a fresh deploy. It only reports WHETHER each variable is set and
 * whether the database answers; it never returns a value. Deliberately avoids the container so it
 * still works when configuration is missing.
 */
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));

  let database: "ok" | "not_configured" | "unreachable" = "not_configured";
  if (process.env.DATABASE_URL) {
    try {
      await getSequelize().query("SELECT 1");
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  const missing = REQUIRED.filter((k) => !process.env[k]);
  return Response.json(
    { ok: missing.length === 0 && database === "ok", env, missing, database, vercelEnv: process.env.VERCEL_ENV ?? null },
    { status: missing.length === 0 && database === "ok" ? 200 : 503 },
  );
}
