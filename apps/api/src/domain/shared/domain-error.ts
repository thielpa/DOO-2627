export type DomainErrorCode = "NOT_FOUND" | "NOT_ALLOWED" | "CONFLICT";

// Raised when a domain rule is violated. The HTTP layer maps the code to a status.
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
