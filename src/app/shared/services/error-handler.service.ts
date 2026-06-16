import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject, signal, computed, DestroyRef } from "@angular/core";
import { getLoggingService } from "@tauri-apps/logger";

export enum ErrorCode {
  UNKNOWN = "UNKNOWN",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  TIMEOUT = "TIMEOUT",
  OFFLINE = "OFFLINE",
}

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  details?: string;
  originalError?: unknown;
  timestamp: Date;
  retryable: boolean;
}

export interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: string;
  };
  message?: string;
  status?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

export interface ErrorLogEntry {
  id: string;
  error: AppError;
  context?: string;
  timestamp: Date;
}

function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable({
  providedIn: "root",
})
export class ErrorHandlerService {
  private logger = getLoggingService();
  private destroyRef = inject(DestroyRef);

  private errorsSignal = signal<AppError[]>([]);
  private logsSignal = signal<ErrorLogEntry[]>([]);
  private isOnlineSignal = signal(navigator.onLine);

  readonly errors = computed(() => this.errorsSignal());
  readonly logs = computed(() => this.logsSignal());
  readonly isOnline = computed(() => this.isOnlineSignal());

  constructor() {
    const boundOnline = () => this.isOnlineSignal.set(true);
    const boundOffline = () => this.isOnlineSignal.set(false);
    window.addEventListener("online", boundOnline);
    window.addEventListener("offline", boundOffline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("online", boundOnline);
      window.removeEventListener("offline", boundOffline);
    });
  }

  handleError(error: unknown, context?: string): AppError {
    this.logger.debug("[ERROR_HANDLER] handleError started", context);
    const appError = this.convertToAppError(error);
    this.logError(appError, context);

    this.logger.debug("[ERROR_HANDLER] handleError completed", context, {
      code: appError.code,
      retryable: appError.retryable,
    });
    return appError;
  }

  handleHttpError(error: HttpErrorResponse, context?: string): AppError {
    this.logger.debug("[ERROR_HANDLER] handleHttpError started", context, {
      status: error.status,
    });
    const appError = this.convertHttpError(error);
    this.logError(appError, context);

    this.logger.debug("[ERROR_HANDLER] handleHttpError completed", context, {
      code: appError.code,
    });
    return appError;
  }

  private convertToAppError(error: unknown): AppError {
    if (error instanceof HttpErrorResponse) {
      return this.convertHttpError(error);
    }

    if (error instanceof Error) {
      return {
        code: ErrorCode.UNKNOWN,
        message: error.message,
        userMessage: "An unexpected error occurred. Please try again.",
        originalError: error,
        timestamp: new Date(),
        retryable: true,
      };
    }

    return {
      code: ErrorCode.UNKNOWN,
      message: String(error),
      userMessage: "An unexpected error occurred. Please try again.",
      timestamp: new Date(),
      retryable: true,
    };
  }

  private convertHttpError(error: HttpErrorResponse): AppError {
    if (!navigator.onLine) {
      return {
        code: ErrorCode.OFFLINE,
        message: "No internet connection",
        userMessage: "You are offline. Please check your internet connection.",
        originalError: error,
        timestamp: new Date(),
        retryable: true,
      };
    }

    switch (error.status) {
      case 0:
        return {
          code: ErrorCode.NETWORK_ERROR,
          message: error.message || "Network request failed",
          userMessage: "Network request failed. Please check your connection.",
          originalError: error,
          timestamp: new Date(),
          retryable: true,
        };
      case 400:
        return this.parseErrorResponse(
          error,
          ErrorCode.VALIDATION_ERROR,
          "Invalid request. Please check your input."
        );
      case 401:
        return this.parseErrorResponse(
          error,
          ErrorCode.UNAUTHORIZED,
          "Authentication required. Please log in."
        );
      case 403:
        return this.parseErrorResponse(
          error,
          ErrorCode.FORBIDDEN,
          "You don't have permission to perform this action."
        );
      case 404:
        return this.parseErrorResponse(
          error,
          ErrorCode.NOT_FOUND,
          "The requested resource was not found."
        );
      case 408:
        return this.parseErrorResponse(
          error,
          ErrorCode.TIMEOUT,
          "Request timed out. Please try again."
        );
      case 500:
        return this.parseErrorResponse(
          error,
          ErrorCode.SERVER_ERROR,
          "Server error. Please try again later."
        );
      case 502:
      case 503:
      case 504:
        return this.parseErrorResponse(
          error,
          ErrorCode.SERVER_ERROR,
          "Service temporarily unavailable. Please try again later."
        );
      default:
        return this.parseErrorResponse(
          error,
          ErrorCode.UNKNOWN,
          "An error occurred. Please try again."
        );
    }
  }

  private parseErrorResponse(
    error: HttpErrorResponse,
    defaultCode: ErrorCode,
    defaultMessage: string
  ): AppError {
    let userMessage = defaultMessage;
    let details: string | undefined;
    let code = defaultCode;

    if (error.error) {
      const errorResp = error.error as ErrorResponse;
      if (errorResp.error?.message) {
        userMessage = errorResp.error.message;
      } else if (errorResp.message) {
        userMessage = errorResp.message;
      }
      details = errorResp.error?.details;
    }

    return {
      code,
      message: error.message || defaultMessage,
      userMessage,
      details,
      originalError: error,
      timestamp: new Date(),
      retryable: code !== ErrorCode.FORBIDDEN && code !== ErrorCode.UNAUTHORIZED,
    };
  }

  async retry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: string
  ): Promise<T> {
    this.logger.debug("[ERROR_HANDLER] retry started", context, {
      maxAttempts: config.maxAttempts,
    });
    const { maxAttempts, delayMs, backoffMultiplier } = { ...DEFAULT_RETRY_CONFIG, ...config };

    let lastError: AppError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.logger.debug("[ERROR_HANDLER] retry completed", context, { attempt });
        return result;
      } catch (error) {
        lastError = this.handleError(error, context);
        if (!lastError.retryable || attempt === maxAttempts) {
          this.logger.error("[ERROR_HANDLER] retry failed", context, { attempt, error: lastError });
          throw lastError;
        }

        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logError(error: AppError, context?: string): void {
    const entry: ErrorLogEntry = {
      id: generateLogId(),
      error,
      context,
      timestamp: new Date(),
    };
    this.logsSignal.update((logs) => [entry, ...logs].slice(0, 100));
    this.errorsSignal.update((errors) => [error, ...errors].slice(0, 100));

    this.logger.error("[ERROR_HANDLER] Error logged", context, {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
    });
  }
}
