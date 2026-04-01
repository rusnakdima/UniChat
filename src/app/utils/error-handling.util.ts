/**
 * Error handling utilities and type guards
 * Provides consistent error detection and handling across the application
 */

/**
 * Base error class for service-level errors
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
    public override cause?: unknown
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Error class for validation failures
 */
export class ValidationError extends ServiceError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "ValidationError";
  }
}

/**
 * Error class for network-related errors
 */
export class NetworkError extends ServiceError {
  constructor(
    message: string,
    public url?: string,
    public status?: number,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.name = "NetworkError";
  }
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): error is NetworkError | TypeError {
  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof TypeError) {
    // Common network-related TypeError messages
    const message = error.message.toLowerCase();
    return (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("load failed")
    );
  }

  return false;
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if an error is a service error
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Check if an HTTP status code indicates an error
 */
export function isHttpErrorStatus(status: number): boolean {
  return status >= 400;
}

/**
 * Check if an HTTP status code indicates a client error
 */
export function isClientErrorStatus(status: number): boolean {
  return status >= 400 && status < 500;
}

/**
 * Check if an HTTP status code indicates a server error
 */
export function isServerErrorStatus(status: number): boolean {
  return status >= 500;
}

/**
 * Check if an error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof NetworkError && error.status === 429) {
    return true;
  }

  const errorMsg = String(error).toLowerCase();
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("rate limit") ||
    errorMsg.includes("too many requests") ||
    errorMsg.includes("quota")
  );
}

/**
 * Get a user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown, context?: string): string {
  if (error instanceof ServiceError) {
    return error.message;
  }

  if (isNetworkError(error)) {
    return context
      ? `Unable to ${context}. Please check your connection and try again.`
      : "Network error. Please check your connection and try again.";
  }

  if (isRateLimitError(error)) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return context ? `An error occurred while ${context}.` : "An unexpected error occurred.";
}

/**
 * Safely execute an async function with error handling
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  context?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[safeAsync] ${context || "Operation"} failed:`, error);
    return defaultValue;
  }
}
