import { DomainError } from "@/domain/errors";
import { assertNoNegativeBalance } from "@/domain/ledger";
import { assertSatang, type Satang } from "@/domain/money";
import { sharesFor, sumShares, type SplitMode } from "@/domain/split";
import { assertKnownPeople } from "../known-people";
import { isGroupSource, type EntryRecord, type TransactionRunner } from "../ports";

export interface UpdateEntryPatch {
  occurredAt?: Date;
  total?: Satang;
  categoryId?: string | null;
  note?: string | null;
  merchant?: string | null;
  split?: SplitMode;
}

/** Editing never touches streak or XP: those come from the press-log moment only. */
export class UpdateEntry {
  constructor(private readonly tx: TransactionRunner) {}

  execute(id: string, patch: UpdateEntryPatch): Promise<EntryRecord> {
    return this.tx.run(async (repos) => {
      const current = await repos.entries.findById(id);
      if (!current) throw new DomainError("NOT_FOUND", "entry not found");

      const touchesMoney = patch.total !== undefined || patch.split !== undefined;
      if (isGroupSource(current.source) && touchesMoney) {
        // The amount and split come from the group's lines; changing them here would desync the two.
        throw new DomainError("ENTRY_LOCKED", "group entries can't change amount or split");
      }
      if (patch.split && current.kind !== "expense") {
        throw new DomainError("INVALID_SPLIT", "only expenses can be fronted");
      }

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
      });
      // A smaller share (or a bigger repayment) must never leave someone owing less than zero.
      assertNoNegativeBalance(await repos.entries.ledger());
      return updated!;
    });
  }
}

/** Deleting does not take back streak or XP (personal app: no anti-cheat). */
export class DeleteEntry {
  constructor(private readonly tx: TransactionRunner) {}

  execute(id: string): Promise<void> {
    return this.tx.run(async (repos) => {
      if (!(await repos.entries.remove(id))) throw new DomainError("NOT_FOUND", "entry not found");
      assertNoNegativeBalance(await repos.entries.ledger());
    });
  }
}
