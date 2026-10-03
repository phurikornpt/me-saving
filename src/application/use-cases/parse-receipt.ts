import { DomainError } from "@/domain/errors";
import type { Satang } from "@/domain/money";
import type { Owner } from "@/domain/split";
import type {
  CategoryRepo,
  Clock,
  LoginAttemptRepo,
  OwnerMemoryRepo,
  ReceiptParser,
  SettingsRepo,
} from "../ports";

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
  owner: Owner;
  /** Where the owner came from: the user's own history beats the AI, which beats the default. */
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

/** Reads a receipt image into an editable draft. Nothing is saved and the image is not kept. */
export class ParseReceipt {
  constructor(
    private readonly parser: ReceiptParser,
    private readonly memory: OwnerMemoryRepo,
    private readonly categories: CategoryRepo,
    private readonly settings: SettingsRepo,
    /** Reuses the generic attempt log (key `receipt-parse`) as a daily AI budget. */
    private readonly budget: LoginAttemptRepo,
    private readonly clock: Clock,
  ) {}

  async execute(image: { data: Uint8Array; mimeType: string }): Promise<ReceiptDraft> {
    if (!ALLOWED_MIME.has(image.mimeType) || image.data.byteLength === 0 || image.data.byteLength > MAX_IMAGE_BYTES) {
      throw new DomainError("INVALID_RECEIPT", "unsupported or oversized image");
    }
    const now = this.clock.now();
    const used = await this.budget.countSince("receipt-parse", new Date(now.getTime() - DAY_MS));
    if (used >= MAX_PARSES_PER_DAY) throw new DomainError("RATE_LIMITED", "daily receipt scan limit reached");
    await this.budget.record("receipt-parse", now); // failed calls count too: they still cost quota

    const [known, categories, settings] = await Promise.all([
      this.memory.all(),
      this.categories.list(),
      this.settings.get(),
    ]);
    const parsed = await this.parser.parse(image, {
      partnerNote: settings.partnerNote,
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
      const remembered = known.get(l.canonicalName);
      if (remembered) return { ...base, owner: remembered, ownerSource: "memory", lowConfidence: false };
      if (l.confident) return { ...base, owner: l.owner, ownerSource: "ai", lowConfidence: false };
      return { ...base, owner: "me", ownerSource: "default", lowConfidence: true };
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
