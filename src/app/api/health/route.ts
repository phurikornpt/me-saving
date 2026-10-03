import { QueryTypes } from "sequelize";
import { getSequelize } from "@/infrastructure/db/sequelize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accounts live in the database (users table), so AUTH_EMAIL / AUTH_PASSWORD_HASH are only read by migration 005.
const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "GEMINI_API_KEY"] as const;

/**
 * Public on purpose, for debugging a fresh deploy. It only reports WHETHER each variable is set, whether
 * the database answers and whether at least one account exists; it never returns a value. Deliberately
 * avoids the container so it still works when configuration is missing.
 */
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));

  let database: "ok" | "not_configured" | "unreachable" | "not_migrated" = "not_configured";
  let hasAccount = false;
  if (process.env.DATABASE_URL) {
    try {
      const [row] = await getSequelize().query<{ any: boolean }>("SELECT EXISTS (SELECT 1 FROM users) AS any", {
        type: QueryTypes.SELECT,
      });
      database = "ok";
      hasAccount = row.any;
    } catch (e) {
      database = /relation "users" does not exist/.test(String(e)) ? "not_migrated" : "unreachable";
    }
  }

  const missing = REQUIRED.filter((k) => !process.env[k]);
  const ok = missing.length === 0 && database === "ok" && hasAccount;
  return Response.json(
    { ok, env, missing, database, hasAccount, vercelEnv: process.env.VERCEL_ENV ?? null },
    { status: ok ? 200 : 503 },
  );
}
