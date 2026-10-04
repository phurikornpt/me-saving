import { z } from "zod";

export const satang = z.number().int().positive().max(2_000_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const people = z.array(z.uuid()).max(20);
const lineOwners = z.object({ me: z.boolean(), people });
// Text that comes from the AI (or from OCR'd receipts) is trimmed to size instead of rejected, so one
// over-long shop name can't make a whole receipt impossible to save.
const clip = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const splitMode = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("equal"), people: people.min(1) }),
  z.object({ kind: z.literal("theirs"), people: people.min(1) }),
  z.object({
    kind: z.literal("custom"),
    shares: z.array(z.object({ personId: z.uuid(), amount: z.number().int().min(0) })).min(1).max(20),
  }),
]);

export const recordEntryBody = z.object({
  kind: z.enum(["expense", "income"]),
  total: satang,
  occurredAt: z.coerce.date().optional(),
  categoryId: z.uuid().nullish(),
  note: z.string().max(200).nullish(),
  merchant: z.string().max(100).nullish(),
  source: z.enum(["manual", "preset", "wheel"]).optional(),
  split: splitMode.optional(),
  walletId: z.uuid().nullish(),
});

export const updateEntryBody = z.object({
  occurredAt: z.coerce.date().optional(),
  total: satang.optional(),
  categoryId: z.uuid().nullish(),
  note: z.string().max(200).nullish(),
  merchant: z.string().max(100).nullish(),
  split: splitMode.optional(),
  walletId: z.uuid().optional(),
  toWalletId: z.uuid().optional(),
});

export const repaymentBody = z.object({
  personId: z.uuid(),
  amount: satang,
  note: z.string().max(200).nullish(),
  walletId: z.uuid().nullish(),
});

export const transferBody = z.object({
  fromWalletId: z.uuid(),
  toWalletId: z.uuid(),
  amount: satang,
  occurredAt: z.coerce.date().optional(),
  note: z.string().max(200).nullish(),
});

export const listEntriesQuery = z.object({
  day: day.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const calendarQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  /** Only this wallet's entries. */
  wallet: z.uuid().optional(),
});
export const dashboardQuery = z.object({ wallet: z.uuid().optional() });

export const saveReceiptBody = z.object({
  source: z.enum(["receipt", "itemized"]).optional(),
  merchant: clip(100).nullish(),
  occurredAt: z.coerce.date().optional(),
  total: satang,
  people: people.optional(),
  walletId: z.uuid().nullish(),
  lines: z
    .array(
      z.object({
        rawName: clip(200).pipe(z.string().min(1)),
        canonicalName: clip(100).pipe(z.string().min(1)),
        qty: z.number().int().min(1).max(999),
        price: z.number().int().min(0).max(2_000_000_000),
        owners: lineOwners,
        categoryId: z.uuid().nullish(),
        lowConfidence: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
});

const icon = z.string().regex(/^[a-z0-9_]{1,60}$/);
export const categoryCreateBody = z.object({
  name: z.string().min(1).max(40),
  icon,
  kind: z.enum(["expense", "income"]),
  sort: z.number().int().min(0).max(1000).default(0),
});
export const categoryPatchBody = z.object({
  name: z.string().min(1).max(40).optional(),
  icon: icon.optional(),
  sort: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
});

export const presetCreateBody = z.object({
  label: z.string().min(1).max(40),
  icon,
  amount: satang,
  categoryId: z.uuid().nullable().default(null),
  personId: z.uuid().nullable().default(null),
  splitKind: z.enum(["equal", "theirs"]).nullable().default(null),
  walletId: z.uuid().nullable().default(null),
  sort: z.number().int().min(0).max(1000).default(0),
});
// Not presetCreateBody.partial(): its defaults would fill in fields the patch didn't send.
export const presetPatchBody = z.object({
  label: z.string().min(1).max(40).optional(),
  icon: icon.optional(),
  amount: satang.optional(),
  categoryId: z.uuid().nullable().optional(),
  personId: z.uuid().nullable().optional(),
  splitKind: z.enum(["equal", "theirs"]).nullable().optional(),
  walletId: z.uuid().nullable().optional(),
  sort: z.number().int().min(0).max(1000).optional(),
});

export const personCreateBody = z.object({
  name: z.string().trim().min(1).max(40),
  note: z.string().max(500).default(""),
});
export const personPatchBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  note: z.string().max(500).optional(),
  sort: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
});

// Signed: a credit card's balance is below zero.
const signedSatang = z.number().int().min(-2_000_000_000).max(2_000_000_000);
export const walletCreateBody = z.object({
  name: z.string().trim().min(1).max(40),
  icon,
  balance: signedSatang.default(0),
});
export const walletPatchBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  icon: icon.optional(),
  sort: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
  balance: signedSatang.optional(),
  /** true = make this the default wallet. */
  isDefault: z.literal(true).optional(),
});

/** Who shares a scanned bill, sent next to the image as a comma-separated form field. */
export const parsePeopleField = (raw: unknown) =>
  people.parse(typeof raw === "string" && raw.trim() ? raw.split(",").map((s) => s.trim()) : []);

export const settingsPatchBody = z.object({
  dashboardLayout: z.array(z.object({ id: z.string(), enabled: z.boolean() })).optional(),
  meNote: z.string().trim().max(500).optional(),
});
