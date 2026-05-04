/* sys lib */
import { Injectable, inject } from "@angular/core";

/* config */
import { APP_CONFIG } from "@config/app.constants";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logging service with configurable log levels per environment
 *
 * Debug mode can be enabled in production by setting:
 *   localStorage.setItem('unichat_debug', 'true')
 * Then reload the app.
 */
@Injectable({
  providedIn: "root",
})
export class LoggerService {
  private readonly debugEnabled = this.checkDebugMode();
  private readonly minLevel: LogLevel = this.debugEnabled
    ? "debug"
    : APP_CONFIG.production
      ? "warn"
      : "debug";

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private checkDebugMode(): boolean {
    if (!APP_CONFIG.production) {
      return true; // Always debug in non-production
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem("unichat_debug") === "true";
      }
    } catch {
      // localStorage might not be available
    }
    return false;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.debugEnabled && this.levels[level] >= this.levels[this.minLevel];
  }

  debug(context: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(`[${context}]`, ...args);
    }
  }

  info(context: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(`[${context}]`, ...args);
    }
  }

  warn(context: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`[${context}]`, ...args);
    }
  }

  error(context: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(`[${context}]`, ...args);
    }
  }
}
