import type {
  ActivityDTO, CalendarDTO, CategoryDTO, DashboardDTO, EntryDTO, OutstandingDTO, PresetDTO,
  ReceiptDraftDTO, SettingsDTO, SplitMode,
} from "./types";

export const AUTH_EXPIRED_EVENT = "me-budget:auth-expired";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (res.status === 401 || res.redirected) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)); // Providers sends the user to /login
    throw new ApiError(401, "UNAUTHORIZED", "login required");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? res.statusText);
  return data as T;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  return s.size ? `?${s}` : "";
};

export const api = {
  dashboard: () => request<DashboardDTO>("GET", "/api/dashboard"),
  calendar: (month: string) => request<CalendarDTO>("GET", `/api/calendar${q({ month })}`),
  entriesOn: (day: string) => request<EntryDTO[]>("GET", `/api/entries${q({ day })}`),
  outstanding: () => request<OutstandingDTO>("GET", "/api/partner/outstanding"),
  categories: () => request<CategoryDTO[]>("GET", "/api/categories"),
  settings: () => request<SettingsDTO>("GET", "/api/settings"),

  recordEntry: (b: {
    kind: "expense" | "income"; total: number; categoryId?: string | null; note?: string | null;
    occurredAt?: string; split?: SplitMode; source?: "manual" | "preset" | "wheel";
  }) => request<ActivityDTO & { entry: EntryDTO }>("POST", "/api/entries", b),
  updateEntry: (id: string, b: Partial<{ total: number; categoryId: string | null; note: string | null; occurredAt: string; split: SplitMode }>) =>
    request<EntryDTO>("PATCH", `/api/entries/${id}`, b),
  deleteEntry: (id: string) => request<void>("DELETE", `/api/entries/${id}`),
  repay: (amount: number, note?: string) => request<ActivityDTO & { entry: EntryDTO; balanceAfter: number }>("POST", "/api/repayments", { amount, note }),
  noSpend: () => request<ActivityDTO>("POST", "/api/no-spend"),

  parseReceipt: (image: Blob) => {
    const f = new FormData();
    f.set("image", image, "receipt.jpg");
    return request<ReceiptDraftDTO>("POST", "/api/receipt/parse", f);
  },
  saveReceipt: (b: {
    merchant?: string | null; occurredAt?: string; total: number;
    lines: { rawName: string; canonicalName: string; qty: number; price: number; owner: "me" | "partner" | "split"; categoryId?: string | null; lowConfidence?: boolean }[];
  }) => request<ActivityDTO & { entry: EntryDTO }>("POST", "/api/receipts", b),

  createPreset: (b: Omit<PresetDTO, "id" | "sort"> & { sort?: number }) => request<PresetDTO>("POST", "/api/presets", b),
  deletePreset: (id: string) => request<void>("DELETE", `/api/presets/${id}`),
  createCategory: (b: { name: string; icon: string; kind: "expense" | "income" }) => request<CategoryDTO>("POST", "/api/categories", b),
  archiveCategory: (id: string) => request<void>("DELETE", `/api/categories/${id}`),
  updateSettings: (b: Partial<SettingsDTO>) => request<SettingsDTO>("PATCH", "/api/settings", b),
  wake: () => fetch("/api/wake", { cache: "no-store" }).catch(() => undefined),
};

/** Short, human-readable reason for a toast: "บันทึกไม่สำเร็จ (BAD_REQUEST: lines.0.price ...)". */
export function describeFailure(prefix: string, e: unknown): string {
  if (e instanceof ApiError) return `${prefix} (${e.code}${e.code === "BAD_REQUEST" || e.status >= 500 ? `: ${e.message.slice(0, 90)}` : ""})`;
  return `${prefix} (เชื่อมต่อไม่ได้)`;
}
