import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Format: scrypt:<N>:<r>:<p>:<salt b64url>:<hash b64url>
// No "$" on purpose: Next/dotenv would expand "$name" inside .env values.
// Defaults follow OWASP (N=2^15, r=8, p=3). Params live in the hash, so they can be raised later.
const DEFAULTS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LEN = 32;
const SALT_LEN = 16;

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }) {
  const options: ScryptOptions = { ...opts, maxmem: 256 * opts.N * opts.r };
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string, params = DEFAULTS): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, params);
  const { N, r, p } = params;
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every((v) => Number.isSafeInteger(v) && v > 0)) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length !== KEY_LEN) return false;
  const actual = await derive(password, Buffer.from(saltB64, "base64url"), params);
  return timingSafeEqual(actual, expected);
}

/** Structural check only (no password involved): is this string a hash this app can verify against? */
export function isWellFormedHash(stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const nums = parts.slice(1, 4).map(Number);
  if (!nums.every((v) => Number.isSafeInteger(v) && v > 0)) return false;
  return Buffer.from(parts[5], "base64url").length === KEY_LEN && Buffer.from(parts[4], "base64url").length > 0;
}
