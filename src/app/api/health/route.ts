import { getSequelize } from "@/infrastructure/db/sequelize";
import { parseExtraAccounts } from "@/infrastructure/security/env-credential-verifier";
import { isWellFormedHash } from "@/infrastructure/security/password";
import { cleanEnv } from "@/lib/env";

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

  // Shape only, never values: helps spot a mangled paste (wrong length, quotes, stray whitespace).
  const rawHash = process.env.AUTH_PASSWORD_HASH;
  const rawEmail = process.env.AUTH_EMAIL;
  const auth = {
    hashWellFormed: rawHash ? isWellFormedHash(cleanEnv(rawHash) ?? "") : false,
    hashLength: rawHash?.length ?? 0, // a hash made by `pnpm auth:hash` is 83 characters
    hashHadQuotesOrWhitespace: rawHash ? cleanEnv(rawHash) !== rawHash : false,
    emailLength: rawEmail?.length ?? 0,
    emailHadQuotesOrWhitespace: rawEmail ? cleanEnv(rawEmail) !== rawEmail : false,
    // AUTH_EXTRA_USERS: how many entries were set vs. how many parsed (a mangled paste parses to fewer)
    extraUsersSet: process.env.AUTH_EXTRA_USERS ? process.env.AUTH_EXTRA_USERS.split(";").filter((s) => s.trim()).length : 0,
    extraUsersParsed: parseExtraAccounts(cleanEnv(process.env.AUTH_EXTRA_USERS)).filter((a) => isWellFormedHash(a.passwordHash)).length,
  };

  const missing = REQUIRED.filter((k) => !process.env[k]);
  return Response.json(
    { ok: missing.length === 0 && database === "ok" && auth.hashWellFormed, env, missing, database, auth, vercelEnv: process.env.VERCEL_ENV ?? null },
    { status: missing.length === 0 && database === "ok" && auth.hashWellFormed ? 200 : 503 },
  );
}
