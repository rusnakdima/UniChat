import { Injectable } from "@angular/core";
import { getLoggingService } from "@tauri-apps/logger";

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  originalError: unknown;
}

@Injectable({ providedIn: "root" })
export class ErrorHandlerService {
  private readonly logger = getLoggingService();

  extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }

    return "An unexpected error occurred";
  }

  isNetworkError(error: unknown): boolean {
    if (error instanceof TypeError) {
      const message = error.message.toLowerCase();
      return (
        message.includes("fetch") ||
        message.includes("network") ||
        message.includes("failed to fetch") ||
        message.includes("load failed")
      );
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("network") || message.includes("fetch")) {
        return true;
      }
      if (error.name === "HttpErrorResponse") {
        return true;
      }
    }

    return false;
  }

  handleError(context: string, error: unknown): void {
    const details = this.extractErrorDetails(error);
    this.logger.error(details.message, details, { source: context });
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

    if (error && typeof error === "object") {
      const msg =
        "message" in error
          ? String((error as { message: unknown }).message)
          : "An unexpected error occurred";
      return {
        name: "UnknownError",
        message: msg,
        originalError: error,
      };
    }

    return {
      name: "UnknownError",
      message: "An unexpected error occurred",
      originalError: error,
    };
  }
}
