import { timingSafeEqual } from "node:crypto";
import type { CredentialVerifier } from "@/application/ports";
import { verifyPassword } from "./password";

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** The one allowed account lives in env. The password hash is ALWAYS checked, so a wrong email costs the same as a wrong password. */
export function createEnvCredentialVerifier(email: string, passwordHash: string): CredentialVerifier {
  const expectedEmail = email.trim().toLowerCase();
  return {
    async verify(inputEmail, password) {
      const emailOk = safeEqual(inputEmail.trim().toLowerCase(), expectedEmail);
      const passwordOk = await verifyPassword(password, passwordHash);
      return emailOk && passwordOk;
    },
  };
}
