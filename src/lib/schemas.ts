import { z } from "zod";

export const satang = z.number().int().positive().max(2_000_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const owner = z.enum(["me", "partner", "split"]);
// Text that comes from the AI (or from OCR'd receipts) is trimmed to size instead of rejected, so one
// over-long shop name can't make a whole receipt impossible to save.
const clip = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const splitMode = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("split") }),
  z.object({ kind: z.literal("partnerAll") }),
  z.object({ kind: z.literal("custom"), partnerShare: z.number().int().min(0) }),
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
});

export const updateEntryBody = z.object({
  occurredAt: z.coerce.date().optional(),
  total: satang.optional(),
  categoryId: z.uuid().nullish(),
  note: z.string().max(200).nullish(),
  merchant: z.string().max(100).nullish(),
  split: splitMode.optional(),
});

export const repaymentBody = z.object({ amount: satang, note: z.string().max(200).nullish() });

export const listEntriesQuery = z.object({
  day: day.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const calendarQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export const saveReceiptBody = z.object({
  merchant: clip(100).nullish(),
  occurredAt: z.coerce.date().optional(),
  total: satang,
  lines: z
    .array(
      z.object({
        rawName: clip(200).pipe(z.string().min(1)),
        canonicalName: clip(100).pipe(z.string().min(1)),
        qty: z.number().int().min(1).max(999),
        price: z.number().int().min(0).max(2_000_000_000),
        owner,
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
  partnerMode: z.enum(["split", "partnerAll"]).nullable().default(null),
  sort: z.number().int().min(0).max(1000).default(0),
});
export const presetPatchBody = presetCreateBody.partial();

export const settingsPatchBody = z.object({
  partnerNote: z.string().max(500).optional(),
  dashboardLayout: z.array(z.object({ id: z.string(), enabled: z.boolean() })).optional(),
});
