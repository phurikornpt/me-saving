"use server";

import { AuthError } from "next-auth";
import type { LoginState } from "@/components/LoginForm";
import { signIn } from "@/lib/auth";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code;
      return { error: code === "rate_limited" ? "rate_limited" : "invalid" };
    }
    throw e; // the redirect after a successful sign-in is thrown too
  }
  return { error: null };
}
