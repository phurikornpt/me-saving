import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Redirects to /login when there is no valid session. Routes and server actions
// still re-check the session themselves: this is a convenience, not the only guard.
export const proxy = NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
