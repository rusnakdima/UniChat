/* sys lib */
import { ErrorHandler, Injectable, inject } from "@angular/core";

/* services */
import { LoggerService } from "@services/core/logger.service";

/**
 * Global error handler for uncaught exceptions
 * Captures errors, logs them, and shows user-friendly notifications
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logger = inject(LoggerService);

  handleError(error: any): void {
    // Extract error details
    const errorDetails = this.extractErrorDetails(error);

    // Log with context
    this.logger.error("GlobalErrorHandler", "Uncaught exception", errorDetails);

    // Show user-friendly notification (only for user-facing errors)
    if (this.shouldShowNotification(error)) {
      this.showErrorNotification(errorDetails);
    }

    // Report to monitoring service (if configured)
    this.reportToMonitoring(error, errorDetails);
  }

  private extractErrorDetails(error: any): ErrorDetails {
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

  private shouldShowNotification(error: any): boolean {
    // Don't show notifications for:
    // - Network errors that will be handled by the service
    // - Expected validation errors
    // - Errors during development (let devtools handle them)

    if (error instanceof Error) {
      // Don't show for expected errors
      if (error.name === "HttpErrorResponse") {
        return false;
      }
    }

    // Show for unexpected errors
    return true;
  }

  private showErrorNotification(details: ErrorDetails): void {
    // In a real implementation, this would show a toast/snackbar
    // For now, we just log it - the UI layer should handle notifications
    console.warn("[User Notification]", this.getUserFriendlyMessage(details));
  }

  private getUserFriendlyMessage(details: ErrorDetails): string {
    // Map technical errors to user-friendly messages
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

  private reportToMonitoring(error: any, details: ErrorDetails): void {
    // Hook for error reporting services (Sentry, LogRocket, etc.)
    // Example:
    // if (typeof Sentry !== 'undefined') {
    //   Sentry.captureException(error, {
    //     tags: {
    //       error_type: details.name,
    //     },
    //   });
    // }

    // For now, just log to console in development
    if (!this.isProduction()) {
      console.error("[Error Report]", details);
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
  originalError: any;
}
