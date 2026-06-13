/* sys lib */
import { ErrorHandler, Injectable, inject } from "@angular/core";

/* services */
import { LoggingService } from "@app/shared/services/logging.service";

/**
 * Global error handler for uncaught exceptions
 * Captures errors, logs them, and shows user-friendly notifications
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logger = inject(LoggingService);

  handleError(error: unknown): void {
    const errorDetails = this.extractErrorDetails(error);

    this.logger.error("GlobalErrorHandler", "Uncaught exception", errorDetails);

    if (this.shouldShowNotification(error)) {
      this.showErrorNotification(errorDetails);
    }

    this.reportToMonitoring(error, errorDetails);
  }

  private extractErrorDetails(error: unknown): ErrorDetails {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        originalError: error,
      };
    }

    if (typeof error === "string") {
      return {
        name: "UnknownError",
        message: error,
        originalError: error,
      };
    }

    return {
      name: "UnknownError",
      message: "An unexpected error occurred",
      originalError: error,
    };
  }

  private shouldShowNotification(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === "HttpErrorResponse") {
        return false;
      }
    }

    return true;
  }

  private showErrorNotification(details: ErrorDetails): void {
    this.logger.warn("UserNotification", this.getUserFriendlyMessage(details));
  }

  private getUserFriendlyMessage(details: ErrorDetails): string {
    const message = details.message.toLowerCase();

    if (message.includes("network") || message.includes("fetch")) {
      return "Unable to connect to the server. Please check your internet connection.";
    }

    if (message.includes("unauthorized") || message.includes("authentication")) {
      return "Your session has expired. Please sign in again.";
    }

    if (message.includes("not found")) {
      return "The requested resource could not be found.";
    }

    if (message.includes("rate limit")) {
      return "Too many requests. Please wait a moment and try again.";
    }

    return "An unexpected error occurred. Please try again.";
  }

  private reportToMonitoring(error: unknown, details: ErrorDetails): void {
    if (!this.isProduction()) {
      this.logger.error("ErrorReport", details.message, details);
    }
  }

  private isProduction(): boolean {
    return typeof window !== "undefined" && window.location.hostname !== "localhost";
  }
}

interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  originalError: unknown;
}
