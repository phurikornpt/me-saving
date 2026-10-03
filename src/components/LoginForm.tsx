"use client";

import { useActionState } from "react";

export type LoginState = { error: "invalid" | "rate_limited" | null };

const MESSAGES = {
  invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  rate_limited: "ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่",
} as const;

export function LoginForm({
  action: login,
}: {
  action: (prev: LoginState, formData: FormData) => Promise<LoginState>;
}) {
  const [state, action, pending] = useActionState(login, { error: null });
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <input
        name="email"
        type="email"
        autoComplete="username"
        placeholder="อีเมล"
        required
        className="rounded-full border-2 border-black/10 px-5 py-3 outline-none focus:border-black"
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="รหัสผ่าน"
        required
        className="rounded-full border-2 border-black/10 px-5 py-3 outline-none focus:border-black"
      />
      {state.error && (
        <p role="alert" className="px-2 text-sm text-red-600">
          {MESSAGES[state.error]}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-full bg-[#29CC57] px-6 py-3 font-medium text-white shadow-[0_4px_0_#15B441] active:translate-y-1 active:shadow-none disabled:opacity-60"
      >
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
