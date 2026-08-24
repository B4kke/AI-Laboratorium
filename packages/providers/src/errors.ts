export type ProviderErrorCode =
  | "circuit-open"
  | "cancelled"
  | "invalid-response"
  | "model-not-free"
  | "not-configured"
  | "rate-limited"
  | "request-failed"
  | "timeout";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean; status?: number } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}
