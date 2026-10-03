import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { auth } from "@/lib/auth";
import { login } from "./actions";

export default async function LoginPage() {
  if (await auth()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">me-budget</h1>
      <LoginForm action={login} />
    </main>
  );
}
