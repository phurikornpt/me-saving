export type DomainErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_SPLIT"
  | "REPAYMENT_EXCEEDS_BALANCE"
  | "NO_SPEND_ALREADY_LOGGED"
  | "RECEIPT_TOTAL_MISMATCH";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
