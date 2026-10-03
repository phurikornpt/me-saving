import { DomainError } from "@/domain/errors";
import { assertSatang, type Satang } from "@/domain/money";
import { partnerBalance } from "@/domain/partner";
import { partnerShareFor, type SplitMode } from "@/domain/split";
import type { EntryRecord, Repos, TransactionRunner } from "../ports";

/** A change must never leave the partner balance negative (this app only tracks "partner owes me"). */
async function assertBalanceStillValid(repos: Repos) {
  const { expenses, repayments } = await repos.entries.partnerLedger();
  if (partnerBalance(expenses, repayments) < 0) {
    throw new DomainError("BALANCE_WOULD_GO_NEGATIVE", "partner repayments would exceed what they owe");
  }
}

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
      if (current.source === "receipt" && touchesMoney) {
        // The amount and split come from the receipt lines; changing them here would desync the two.
        throw new DomainError("ENTRY_LOCKED", "receipt entries can't change amount or split");
      }
      if (patch.split && current.kind !== "expense") {
        throw new DomainError("INVALID_SPLIT", "only expenses can be fronted for partner");
      }

      const total = patch.total ?? current.total;
      assertSatang(total);
      if (total === 0) throw new DomainError("INVALID_AMOUNT", "amount must be positive");

      let partnerShare = current.partnerShare;
      if (patch.split) partnerShare = partnerShareFor(total, patch.split);
      else if (partnerShare > total) throw new DomainError("INVALID_SPLIT", "partner share exceeds the new total");

      const updated = await repos.entries.update(id, {
        total,
        partnerShare,
        ...(patch.occurredAt !== undefined && { occurredAt: patch.occurredAt }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.merchant !== undefined && { merchant: patch.merchant }),
      });
      await assertBalanceStillValid(repos);
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
      await assertBalanceStillValid(repos);
    });
  }
}
