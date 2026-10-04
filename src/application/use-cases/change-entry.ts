import { DomainError } from "@/domain/errors";
import { assertNoNegativeBalance, assertRepaidUnchanged, repaidBy } from "@/domain/ledger";
import { assertSatang, type Satang } from "@/domain/money";
import { sharesFor, sharesOfLines, sumShares, type SplitMode } from "@/domain/split";
import { assertTransfer } from "@/domain/wallet";
import { assertKnownPeople } from "../known-people";
import { assertActiveWallets } from "../known-wallets";
import {
  isGroupSource,
  type Clock,
  type EntryRecord,
  type NewReceiptLine,
  type Repos,
  type TransactionRunner,
} from "../ports";
import { prepareGroup, rememberOwners, type SaveReceiptInput } from "./save-receipt-entry";

export interface UpdateEntryPatch {
  occurredAt?: Date;
  total?: Satang;
  categoryId?: string | null;
  note?: string | null;
  merchant?: string | null;
  split?: SplitMode;
  walletId?: string;
  /** Transfers only. */
  toWalletId?: string;
}

/** Editing never touches streak or XP: those come from the press-log moment only. */
export class UpdateEntry {
  constructor(private readonly tx: TransactionRunner) {}

  execute(id: string, patch: UpdateEntryPatch): Promise<EntryRecord> {
    return this.tx.run(async (repos) => {
      const current = await repos.entries.findById(id);
      if (!current) throw new DomainError("NOT_FOUND", "entry not found");

      const touchesMoney = patch.total !== undefined || patch.split !== undefined;
      const movesDate = patch.occurredAt !== undefined && patch.occurredAt.getTime() !== current.occurredAt.getTime();
      const before = await repos.entries.ledger();
      if ((touchesMoney || movesDate) && repaidBy(before, id).length > 0) {
        // Paid-back money stays on what it paid for: the amount, split and date are frozen from then on.
        throw new DomainError("ENTRY_REPAID", "someone already paid this back");
      }
      if (isGroupSource(current.source) && touchesMoney) {
        // The amount and split come from the group's lines; changing them here would desync the two.
        throw new DomainError("ENTRY_LOCKED", "group entries can't change amount or split");
      }
      if (patch.split && current.kind !== "expense") {
        throw new DomainError("INVALID_SPLIT", "only expenses can be fronted");
      }

      if (patch.toWalletId !== undefined && current.kind !== "transfer") {
        throw new DomainError("INVALID_TRANSFER", "only transfers have a wallet to send to");
      }
      const walletId = patch.walletId ?? current.walletId;
      const toWalletId = patch.toWalletId ?? current.toWalletId;
      if (current.kind === "transfer") assertTransfer(walletId, toWalletId!);
      // Moving an entry onto a wallet needs it to be active; leaving it where it is never does.
      await assertActiveWallets(
        repos.wallets,
        [
          walletId !== current.walletId ? walletId : null,
          toWalletId !== current.toWalletId ? toWalletId : null,
        ].filter((id): id is string => id !== null),
      );

      const total = patch.total ?? current.total;
      assertSatang(total);
      if (total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");

      let shares = current.shares;
      if (patch.split) {
        shares = sharesFor(total, patch.split);
        await assertKnownPeople(repos.people, shares.map((s) => s.personId));
      } else if (sumShares(shares) > total) {
        throw new DomainError("INVALID_SPLIT", "the shares exceed the new total");
      }

      const updated = await repos.entries.update(id, {
        total,
        ...(patch.split && { shares }),
        ...(patch.occurredAt !== undefined && { occurredAt: patch.occurredAt }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.merchant !== undefined && { merchant: patch.merchant }),
        ...(patch.walletId !== undefined && { walletId }),
        ...(patch.toWalletId !== undefined && { toWalletId }),
      });
      // A smaller share (or a bigger repayment) must never leave someone owing less than zero.
      const after = await repos.entries.ledger();
      assertNoNegativeBalance(after);
      // Fixing a repayment itself may move what it covers; editing anything else may not.
      if (current.kind !== "repayment") assertRepaidUnchanged(before, after);
      return updated!;
    });
  }
}

/** Deleting does not take back streak or XP (personal app: no anti-cheat). */
export class DeleteEntry {
  constructor(private readonly tx: TransactionRunner) {}

  execute(id: string): Promise<void> {
    return this.tx.run(async (repos) => {
      const current = await repos.entries.findById(id);
      if (!current) throw new DomainError("NOT_FOUND", "entry not found");
      const before = await repos.entries.ledger();
      // A paid-back entry can't go: its repayment would silently move onto other entries.
      if (current.kind !== "repayment" && repaidBy(before, id).length > 0) {
        throw new DomainError("ENTRY_REPAID", "someone already paid this back");
      }
      await repos.entries.remove(id);
      const after = await repos.entries.ledger();
      assertNoNegativeBalance(after);
      if (current.kind !== "repayment") assertRepaidUnchanged(before, after);
    });
  }
}

export interface UpdateGroupInput {
  merchant?: string | null;
  occurredAt?: Date;
  /** Final amount paid; the lines are scaled to it, as when the group was saved. */
  total: Satang;
  walletId?: string;
  /** Who shares this bill. Default: everyone named on a line. */
  people?: string[];
  lines: SaveReceiptInput["lines"];
}

/**
 * Edits a group entry (receipt or hand-typed): its lines, who shares it, its total, name, date and wallet.
 * Refused once anyone has paid part of it back.
 */
export class UpdateGroupEntry {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  execute(id: string, input: UpdateGroupInput): Promise<EntryRecord> {
    const { people, lines } = prepareGroup(input);
    return this.tx.run(async (repos) => {
      const current = await repos.entries.findById(id);
      if (!current) throw new DomainError("NOT_FOUND", "entry not found");
      if (!isGroupSource(current.source)) throw new DomainError("INVALID_RECEIPT", "not a group entry");
      const before = await repos.entries.ledger();
      if (repaidBy(before, id).length > 0) throw new DomainError("ENTRY_REPAID", "someone already paid this back");

      await assertKnownPeople(repos.people, people);
      if (input.walletId !== undefined && input.walletId !== current.walletId) {
        await assertActiveWallets(repos.wallets, [input.walletId]);
      }
      const updated = await repos.entries.update(id, {
        total: input.total,
        shares: sharesOfLines(lines),
        ...(input.merchant !== undefined && { merchant: input.merchant }),
        ...(input.occurredAt !== undefined && { occurredAt: input.occurredAt }),
        ...(input.walletId !== undefined && { walletId: input.walletId }),
      });
      await repos.receiptLines.replace(id, lines);
      await rememberOwners(repos, people, lines, this.clock.now());

      const after = await repos.entries.ledger();
      assertNoNegativeBalance(after);
      assertRepaidUnchanged(before, after); // e.g. a new date that puts this before an entry already paid
      return updated!;
    });
  }
}

export interface EntryDetail {
  entry: EntryRecord;
  /** A group's lines, in order. Empty for other entries. */
  lines: NewReceiptLine[];
  /** People who already paid part of it back: amount, split and date are then frozen. */
  repaidBy: string[];
}

export class GetEntryDetail {
  constructor(private readonly repos: Repos) {}

  async execute(id: string): Promise<EntryDetail> {
    const entry = await this.repos.entries.findById(id);
    if (!entry) throw new DomainError("NOT_FOUND", "entry not found");
    const [lines, ledger] = await Promise.all([this.repos.receiptLines.listByEntries([id]), this.repos.entries.ledger()]);
    return { entry, lines: lines.get(id) ?? [], repaidBy: repaidBy(ledger, id) };
  }
}
