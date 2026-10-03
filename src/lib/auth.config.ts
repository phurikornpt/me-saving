import type { NextAuthConfig } from "next-auth";

const NINETY_DAYS = 60 * 60 * 24 * 90;

/** Edge-safe part (no DB): used by proxy.ts to gate every request on the JWT cookie. */
export const authConfig = {
  session: { strategy: "jwt", maxAge: NINETY_DAYS },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname === "/api/health" || pathname.startsWith("/api/auth")) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
