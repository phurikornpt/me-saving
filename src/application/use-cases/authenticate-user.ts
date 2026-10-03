import { DomainError } from "@/domain/errors";
import type { Clock, CredentialVerifier, LoginAttemptRepo } from "../ports";

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Login for any account. Failed attempts are throttled per email AND per IP, so a
 * spray from one IP or a grind on one account both stop after 5 misses / 15 min.
 * Returns the account id, or null for wrong credentials.
 */
export class AuthenticateUser {
  constructor(
    private readonly attempts: LoginAttemptRepo,
    private readonly verifier: CredentialVerifier,
    private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; password: string; ip: string }): Promise<string | null> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
    const keys = [`email:${input.email.trim().toLowerCase()}`, `ip:${input.ip}`];

    for (const key of keys) {
      if ((await this.attempts.countSince(key, since)) >= MAX_FAILED_ATTEMPTS) {
        throw new DomainError("RATE_LIMITED", "too many failed logins");
      }
    }

    const userId = await this.verifier.verify(input.email, input.password);
    if (userId) {
      for (const key of keys) await this.attempts.clear(key);
      return userId;
    }
    for (const key of keys) await this.attempts.record(key, now);
    return null;
  }
}
