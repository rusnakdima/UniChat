/* sys lib */
import { Injectable, inject } from "@angular/core";

/* config */
import { APP_CONFIG } from "@config/app.constants";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logging service with configurable log levels per environment
 */
@Injectable({
  providedIn: "root",
})
export class LoggerService {
  private readonly enabled = !APP_CONFIG.production;
  private readonly minLevel: LogLevel = APP_CONFIG.production ? "warn" : "debug";

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && this.levels[level] >= this.levels[this.minLevel];
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
