export type DomainErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_SPLIT"
  | "REPAYMENT_EXCEEDS_BALANCE"
  | "NO_SPEND_ALREADY_LOGGED"
  | "RECEIPT_TOTAL_MISMATCH"
  | "RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "INVALID_RECEIPT"
  | "NOT_FOUND"
  | "BALANCE_WOULD_GO_NEGATIVE"
  | "ENTRY_LOCKED";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
