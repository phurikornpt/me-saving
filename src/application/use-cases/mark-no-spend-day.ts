import { bangkokDay } from "@/domain/day";
import { DomainError } from "@/domain/errors";
import { logActivity, type ActivityResult } from "../log-activity";
import type { Clock, TransactionRunner } from "../ports";

export class MarkNoSpendDay {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** Only for today, and only if today isn't already logged. */
  async execute(): Promise<ActivityResult> {
    const now = this.clock.now();
    return this.tx.run(async (repos) => {
      if (await repos.loggedDays.has(bangkokDay(now))) {
        throw new DomainError("NO_SPEND_ALREADY_LOGGED", "today is already logged");
      }
      return logActivity(repos, now, "no_spend");
    });
  }
}
