import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DomainError } from "@/domain/errors";
import { authConfig } from "./auth.config";
import { container } from "./container";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "unknown";
        try {
          const ok = await container().authenticateUser.execute({ email, password, ip });
          return ok ? { id: "me", email: email.trim().toLowerCase() } : null;
        } catch (e) {
          if (e instanceof DomainError && e.code === "RATE_LIMITED") throw new RateLimitedSignin();
          throw e;
        }
      },
    }),
  ],
});
