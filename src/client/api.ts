import type {
  ActivityDTO,
  CalendarDTO,
  CategoryBreakdownDTO,
  CategoryDTO,
  DashboardDTO,
  EntryDTO,
  EntryDetailDTO,
  EntryTextDraftDTO,
  LineOwners,
  MonthSummaryDTO,
  OutstandingDTO,
  PersonDTO,
  PresetDTO,
  ReceiptDraftDTO,
  SettingsDTO,
  SplitMode,
  WalletDTO,
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
  /** `wallet`: narrow today's totals and recent entries to one wallet. */
  dashboard: (wallet?: string | null) => request<DashboardDTO>("GET", `/api/dashboard${q({ wallet: wallet ?? undefined })}`),
  calendar: (month: string, wallet?: string | null) =>
    request<CalendarDTO>("GET", `/api/calendar${q({ month, wallet: wallet ?? undefined })}`),
  categoryBreakdown: (month: string, wallet?: string | null) =>
    request<CategoryBreakdownDTO>("GET", `/api/stats/categories${q({ month, wallet: wallet ?? undefined })}`),
  /** May call the AI (once per month at most, and it counts against the daily AI limit). */
  monthSummary: (month: string) => request<MonthSummaryDTO>("GET", `/api/summary${q({ month })}`),
  entriesOn: (day: string) => request<EntryDTO[]>("GET", `/api/entries${q({ day })}`),
  outstanding: () => request<OutstandingDTO>("GET", "/api/people/outstanding"),
  entryDetail: (id: string) => request<EntryDetailDTO>("GET", `/api/entries/${id}`),
  people: () => request<PersonDTO[]>("GET", "/api/people"),
  categories: () => request<CategoryDTO[]>("GET", "/api/categories"),
  settings: () => request<SettingsDTO>("GET", "/api/settings"),
  wallets: () => request<WalletDTO[]>("GET", "/api/wallets"),

  recordEntry: (b: {
    kind: "expense" | "income"; total: number; categoryId?: string | null; note?: string | null;
    occurredAt?: string; split?: SplitMode; source?: "manual" | "preset" | "wheel";
    /** Omit for the default wallet. */
    walletId?: string;
  }) => request<ActivityDTO & { entry: EntryDTO }>("POST", "/api/entries", b),
  updateEntry: (
    id: string,
    b: Partial<{
      total: number; categoryId: string | null; note: string | null; occurredAt: string; split: SplitMode;
      walletId: string; toWalletId: string;
    }>,
  ) =>
    request<EntryDTO>("PATCH", `/api/entries/${id}`, b),
  deleteEntry: (id: string) => request<void>("DELETE", `/api/entries/${id}`),
  repay: (personId: string, amount: number, walletId?: string) =>
    request<ActivityDTO & { entry: EntryDTO; balanceAfter: number }>("POST", "/api/repayments", { personId, amount, walletId }),
  transfer: (b: { fromWalletId: string; toWalletId: string; amount: number; note?: string | null }) =>
    request<{ entry: EntryDTO }>("POST", "/api/transfers", b),
  noSpend: () => request<ActivityDTO>("POST", "/api/no-spend"),

  /** `people`: who shares the bill. None = just read the lines. */
  parseReceipt: (image: Blob, people: string[] = []) => {
    const f = new FormData();
    f.set("image", image, "receipt.jpg");
    if (people.length) f.set("people", people.join(","));
    return request<ReceiptDraftDTO>("POST", "/api/receipt/parse", f);
  },
  /** One typed or spoken sentence -> an unsaved draft entry. Counts against the daily AI budget. */
  parseEntryText: (text: string) => request<EntryTextDraftDTO>("POST", "/api/entry/parse", { text }),
  saveReceipt: (b: {
    source?: "receipt" | "itemized"; merchant?: string | null; occurredAt?: string; total: number; people?: string[];
    walletId?: string;
    lines: { rawName: string; canonicalName: string; qty: number; price: number; owners: LineOwners; categoryId?: string | null; lowConfidence?: boolean }[];
  }) => request<ActivityDTO & { entry: EntryDTO }>("POST", "/api/receipts", b),
  /** Replace a group's lines. Refused (ENTRY_REPAID) once someone paid part of it back. */
  updateGroup: (
    id: string,
    b: {
      merchant: string | null; occurredAt?: string; total: number; people: string[]; walletId?: string;
      lines: { rawName: string; canonicalName: string; qty: number; price: number; owners: LineOwners; categoryId?: string | null }[];
    },
  ) => request<EntryDTO>("PUT", `/api/receipts/${id}`, b),

  createPreset: (b: Omit<PresetDTO, "id" | "sort" | "walletId"> & { sort?: number; walletId?: string | null }) => request<PresetDTO>("POST", "/api/presets", b),
  deletePreset: (id: string) => request<void>("DELETE", `/api/presets/${id}`),
  createCategory: (b: { name: string; icon: string; kind: "expense" | "income" }) => request<CategoryDTO>("POST", "/api/categories", b),
  archiveCategory: (id: string) => request<void>("DELETE", `/api/categories/${id}`),
  createPerson: (b: { name: string; note?: string }) => request<PersonDTO>("POST", "/api/people", b),
  updatePerson: (id: string, b: Partial<Pick<PersonDTO, "name" | "note" | "archived" | "sort">>) =>
    request<PersonDTO>("PATCH", `/api/people/${id}`, b),
  createWallet: (b: { name: string; icon: string; balance?: number }) => request<WalletDTO>("POST", "/api/wallets", b),
  updateWallet: (id: string, b: Partial<{ name: string; icon: string; sort: number; archived: boolean; balance: number; isDefault: true }>) =>
    request<WalletDTO>("PATCH", `/api/wallets/${id}`, b),
  updateSettings: (b: Partial<SettingsDTO>) => request<SettingsDTO>("PATCH", "/api/settings", b),
  wake: () => fetch("/api/wake", { cache: "no-store" }).catch(() => undefined),
};

/** Short, human-readable reason for a toast: "บันทึกไม่สำเร็จ (BAD_REQUEST: lines.0.price ...)". */
export function describeFailure(prefix: string, e: unknown): string {
  if (e instanceof ApiError) return `${prefix} (${e.code}${e.code === "BAD_REQUEST" || e.status >= 500 ? `: ${e.message.slice(0, 90)}` : ""})`;
  return `${prefix} (เชื่อมต่อไม่ได้)`;
}
