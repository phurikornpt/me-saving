import { timingSafeEqual } from "node:crypto";
import type { CredentialVerifier } from "@/application/ports";
import { verifyPassword } from "./password";

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export interface Account {
  email: string;
  passwordHash: string;
}

/**
 * Extra allowed accounts: `email|hash;email2|hash2`. Hashes contain ":" but never "|" or ";".
 * Malformed entries are skipped, so a typo can't lock the main account out.
 */
export function parseExtraAccounts(raw: string | undefined): Account[] {
  return (raw ?? "")
    .split(";")
    .map((entry) => entry.trim().split("|"))
    .filter((p): p is [string, string] => p.length === 2 && p[0].trim() !== "" && p[1].trim() !== "")
    .map(([email, passwordHash]) => ({ email: email.trim(), passwordHash: passwordHash.trim() }));
}

/**
 * The allowed accounts live in env (the main one plus any extras). Every account's password hash is
 * ALWAYS checked, so a wrong email costs the same as a wrong password, and the number of accounts
 * doesn't show in the timing.
 */
export function createEnvCredentialVerifier(email: string, passwordHash: string, extra: Account[] = []): CredentialVerifier {
  const accounts = [{ email, passwordHash }, ...extra].map((a) => ({ ...a, email: a.email.trim().toLowerCase() }));
  return {
    async verify(inputEmail, password) {
      const given = inputEmail.trim().toLowerCase();
      const results = await Promise.all(
        accounts.map(async (a) => {
          const emailOk = safeEqual(given, a.email);
          const passwordOk = await verifyPassword(password, a.passwordHash);
          return emailOk && passwordOk;
        }),
      );
      return results.some(Boolean);
    },
  };
}
