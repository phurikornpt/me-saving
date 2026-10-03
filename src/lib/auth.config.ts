import type { NextAuthConfig } from "next-auth";

const NINETY_DAYS = 60 * 60 * 24 * 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in account's id. Sessions from before accounts existed carry "me" and count as signed out. */
export const accountIdOf = (session: { user?: { id?: string | null } } | null): string | null => {
  const id = session?.user?.id;
  return id && UUID.test(id) ? id : null;
};

/** Edge-safe part (no DB): used by proxy.ts to gate every request on the JWT cookie. */
export const authConfig = {
  session: { strategy: "jwt", maxAge: NINETY_DAYS },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname === "/api/health" || pathname.startsWith("/api/auth")) return true;
      return accountIdOf(auth) !== null;
    },
    // The JWT keeps the account id in `sub` (set from authorize()'s user.id); expose it on the session.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
