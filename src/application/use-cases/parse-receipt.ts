import { DomainError } from "@/domain/errors";
import type { Satang } from "@/domain/money";
import { ME_ONLY, type LineOwners } from "@/domain/split";
import type {
  CategoryRepo,
  Clock,
  LoginAttemptRepo,
  OwnerMemoryRepo,
  PersonRepo,
  ReceiptParser,
} from "../ports";

/** The limit used before accounts existed; pass it as `scanLimit.perDay` to enforce it again. */
export const MAX_PARSES_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface ReceiptDraftLine {
  rawName: string;
  canonicalName: string;
  qty: number;
  price: Satang;
  categoryName: string | null;
  owners: LineOwners;
  /** Where the owners came from: the user's own history beats the AI, which beats the default (us). */
  ownerSource: "memory" | "ai" | "default";
  lowConfidence: boolean;
}

export interface ReceiptDraft {
  merchant: string | null;
  date: string | null;
  total: Satang;
  lines: ReceiptDraftLine[];
  /** Printed lines don't add up to the paid total (reading error, or a bill-level discount). */
  sumMismatch: boolean;
}

/** A remembered choice, narrowed to who is on this bill. Null when nobody it names is here. */
function rememberedFor(owners: LineOwners | undefined, onBill: Set<string>): LineOwners | null {
  if (!owners) return null;
  const narrowed = { me: owners.me, people: owners.people.filter((id) => onBill.has(id)) };
  return narrowed.me || narrowed.people.length > 0 ? narrowed : null;
}

/**
 * Reads a receipt image into an editable draft. Nothing is saved and the image is not kept.
 * With no `people` it only reads the lines (all ours); with people it also guesses who each line is for.
 */
export class ParseReceipt {
  constructor(
    private readonly parser: ReceiptParser,
    private readonly memory: OwnerMemoryRepo,
    private readonly categories: CategoryRepo,
    private readonly people: PersonRepo,
    /** Reuses the generic attempt log as a daily AI budget. */
    private readonly budget: LoginAttemptRepo,
    private readonly clock: Clock,
    /** Scans are always counted under `key` (one per account); `perDay: null` = counted but never blocked. */
    private readonly scanLimit: { key: string; perDay: number | null } = { key: "receipt-parse", perDay: MAX_PARSES_PER_DAY },
  ) {}

  async execute(image: { data: Uint8Array; mimeType: string }, peopleIds: string[] = []): Promise<ReceiptDraft> {
    if (!ALLOWED_MIME.has(image.mimeType) || image.data.byteLength === 0 || image.data.byteLength > MAX_IMAGE_BYTES) {
      throw new DomainError("INVALID_RECEIPT", "unsupported or oversized image");
    }
    const everyone = await this.people.list();
    const onBill = new Set(peopleIds);
    const people = everyone.filter((p) => onBill.has(p.id));
    if (people.length !== onBill.size) throw new DomainError("UNKNOWN_PERSON", "unknown person on the bill");

    const now = this.clock.now();
    const { key, perDay } = this.scanLimit;
    if (perDay !== null && (await this.budget.countSince(key, new Date(now.getTime() - DAY_MS))) >= perDay) {
      throw new DomainError("RATE_LIMITED", "daily receipt scan limit reached");
    }
    await this.budget.record(key, now); // failed calls count too: they still cost quota

    const [known, categories] = await Promise.all([this.memory.all(), this.categories.list()]);
    const parsed = await this.parser.parse(image, {
      people: people.map(({ id, name, note }) => ({ id, name, note })),
      knownNames: [...known.keys()],
      categoryNames: categories.filter((c) => c.kind === "expense" && !c.archived).map((c) => c.name),
    });

    const lines = parsed.lines.map((l): ReceiptDraftLine => {
      const base = {
        rawName: l.rawName,
        canonicalName: l.canonicalName,
        qty: l.qty,
        price: l.price,
        categoryName: l.categoryName,
      };
      if (people.length === 0) return { ...base, owners: ME_ONLY, ownerSource: "default", lowConfidence: false };
      const remembered = rememberedFor(known.get(l.canonicalName), onBill);
      if (remembered) return { ...base, owners: remembered, ownerSource: "memory", lowConfidence: false };
      const ai = rememberedFor(l.owners, onBill); // never trust the model with an id we didn't give it
      if (l.confident && ai) return { ...base, owners: ai, ownerSource: "ai", lowConfidence: false };
      return { ...base, owners: ME_ONLY, ownerSource: "default", lowConfidence: true };
    });
    const sum = lines.reduce((s, l) => s + l.price, 0);
    return {
      merchant: parsed.merchant,
      date: parsed.date,
      total: parsed.total,
      lines,
      sumMismatch: sum !== parsed.total,
    };
  }
}
