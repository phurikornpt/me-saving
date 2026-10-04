import { DomainError } from "@/domain/errors";
import type { Clock, LoginAttemptRepo } from "./ports";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shared daily AI allowance of one account: `key` is `ai:${userId}`, `perDay: null` = counted but never blocked. */
export interface AiLimit {
  key: string;
  perDay: number | null;
}

/**
 * Takes one AI call out of today's allowance, or throws RATE_LIMITED. Call it BEFORE the model:
 * a failed call still costs quota, so it is counted whatever happens next.
 */
export async function spendAiBudget(budget: LoginAttemptRepo, clock: Clock, { key, perDay }: AiLimit): Promise<void> {
  const now = clock.now();
  if (perDay !== null && (await budget.countSince(key, new Date(now.getTime() - DAY_MS))) >= perDay) {
    throw new DomainError("RATE_LIMITED", "daily AI limit reached");
  }
  await budget.record(key, now);
}
