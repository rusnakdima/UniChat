/**
 * Result type for error handling
 * Provides type-safe error handling without exceptions
 *
 * @example
 * ```typescript
 * const result = ResultUtil.from(() => riskyOperation());
 * if (!result.ok) {
 *   logger.error('Operation failed', result.error);
 *   return;
 * }
 * // result.value is guaranteed to be the success type
 * processResult(result.value);
 * ```
 */

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Custom error classes for common scenarios
 */
export class NotFoundError extends Error {
  constructor(
    public readonly resource: string,
    message?: string
  ) {
    super(message ?? `Resource not found: ${resource}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message?: string) {
    super(message ?? "Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends Error {
  constructor(message?: string) {
    super(message ?? "Resource conflict");
    this.name = "ConflictError";
  }
}

export class RateLimitError extends Error {
  constructor(
    message?: string,
    public readonly retryAfter?: number
  ) {
    super(message ?? "Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

/**
 * Result utility class with helper methods
 */
export class R {
  /**
   * Create a successful Result
   */
  static ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
  }

  /**
   * Create a failed Result
   */
  static err<E>(error: E): Result<never, E> {
    return { ok: false, error };
  }

  /**
   * Execute a function and capture any errors
   */
  static from<T, E = Error>(fn: () => T): Result<T, E> {
    try {
      return R.ok(fn());
    } catch (error) {
      return R.err(error as E);
    }
  }

  /**
   * Execute an async function and capture any errors
   */
  static async fromAsync<T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>> {
    try {
      return R.ok(await fn());
    } catch (error) {
      return R.err(error as E);
    }
  }

  /**
   * Create a Result from a nullable value
   */
  static fromNullable<T, E = Error>(value: T | null | undefined, error: E): Result<T, E> {
    if (value == null) {
      return R.err(error);
    }
    return R.ok(value);
  }

  /**
   * Create a Result from a boolean condition
   */
  static fromCondition<T, E = Error>(condition: boolean, value: T, error: E): Result<T, E> {
    if (!condition) {
      return R.err(error);
    }
    return R.ok(value);
  }

  /**
   * Map the success value to a new value
   */
  static map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result.ok) {
      return R.ok(fn(result.value));
    }
    return R.err(result.error);
  }

  /**
   * Map the error value to a new error
   */
  static mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (result.ok) {
      return R.ok(result.value);
    }
    return R.err(fn(result.error));
  }

  /**
   * Chain operations that return Results
   */
  static andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    if (result.ok) {
      return fn(result.value);
    }
    return R.err(result.error);
  }

  /**
   * Get the value or provide a default on failure
   */
  static unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
  }

  /**
   * Get the value or compute a default from the error
   */
  static unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
    return result.ok ? result.value : fn(result.error);
  }

  /**
   * Get the value or throw an error
   */
  static unwrap<T, E>(result: Result<T, E>): T {
    if (!result.ok) {
      const error = result.error instanceof Error ? result.error : new Error(String(result.error));
      throw error;
    }
    return result.value;
  }

  /**
   * Get the error or throw if successful
   */
  static unwrapErr<T, E>(result: Result<T, E>): E {
    if (result.ok) {
      throw new Error("Called unwrapErr on a successful Result");
    }
    return result.error;
  }

  /**
   * Check if the Result is successful
   */
  static isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
    return result.ok === true;
  }

  /**
   * Check if the Result is a failure
   */
  static isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
    return result.ok === false;
  }
}

// Re-export for convenience
export const { ok, err, from, fromAsync, fromNullable, fromCondition, map, mapErr, andThen } = R;
