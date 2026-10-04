import { DomainError } from "@/domain/errors";
import type { Clock, LoginAttemptRepo } from "./ports";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The per-account AI budget: every AI call is counted under `key` (one per account); `perDay: null` = counted but never blocked. */
export interface AiLimit {
  key: string;
  perDay: number | null;
}

/**
 * Takes one call from the budget before an AI call, or throws RATE_LIMITED when it is used up.
 * Recorded before the call on purpose: failed calls still cost quota.
 */
export async function spendAiCall(budget: LoginAttemptRepo, clock: Clock, { key, perDay }: AiLimit): Promise<void> {
  const now = clock.now();
  if (perDay !== null && (await budget.countSince(key, new Date(now.getTime() - DAY_MS))) >= perDay) {
    throw new DomainError("RATE_LIMITED", "daily AI limit reached");
  }
  await budget.record(key, now);
}
