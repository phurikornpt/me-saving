import type { Clock, LoginAttemptRepo } from "../ports";
import type { AiLimit } from "../ai-budget";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiBudgetStatus {
  /** Calls counted in the last 24 hours (a sliding window, not a reset at midnight). */
  used: number;
  /** null = no limit. */
  limit: number | null;
  /** null = no limit. Never negative. */
  remaining: number | null;
}

/** How much of today's shared AI allowance is left. Read-only: asking costs nothing. */
export class GetAiBudget {
  constructor(
    private readonly budget: Pick<LoginAttemptRepo, "countSince">,
    private readonly clock: Clock,
    private readonly limit: AiLimit,
  ) {}

  async execute(): Promise<AiBudgetStatus> {
    const used = await this.budget.countSince(this.limit.key, new Date(this.clock.now().getTime() - DAY_MS));
    const { perDay } = this.limit;
    return { used, limit: perDay, remaining: perDay === null ? null : Math.max(0, perDay - used) };
  }
}
