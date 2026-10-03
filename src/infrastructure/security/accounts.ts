/** An account as configured in env before accounts moved into the database (migration 005-users). */
export interface Account {
  email: string;
  passwordHash: string;
}

/**
 * Extra accounts: `email|hash;email2|hash2`. Hashes contain ":" but never "|" or ";".
 * Malformed entries are skipped, so a typo can't lock the main account out.
 */
export function parseExtraAccounts(raw: string | undefined): Account[] {
  return (raw ?? "")
    .split(";")
    .map((entry) => entry.trim().split("|"))
    .filter((p): p is [string, string] => p.length === 2 && p[0].trim() !== "" && p[1].trim() !== "")
    .map(([email, passwordHash]) => ({ email: email.trim(), passwordHash: passwordHash.trim() }));
}
