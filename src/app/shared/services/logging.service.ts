import { Injectable, signal } from "@angular/core";
import { APP_CONFIG } from "@config/app.constants";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown[];
}

@Injectable({ providedIn: "root" })
export class LoggingService {
  private readonly logs = signal<LogEntry[]>([]);
  readonly recentLogs = this.logs.asReadonly();

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
      return true;
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

  private addLog(level: LogLevel, context: string, message: string, data?: unknown[]): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      context,
      message,
      data,
    };
    this.logs.update((logs) => [...logs.slice(-99), entry]);
  }

  debug(context: string, message: string, ...data: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(`[${context}]`, message, ...data);
    }
    this.addLog("debug", context, message, data);
  }

  info(context: string, message: string, ...data: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(`[${context}]`, message, ...data);
    }
    this.addLog("info", context, message, data);
  }

  warn(context: string, message: string, ...data: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`[${context}]`, message, ...data);
    }
    this.addLog("warn", context, message, data);
  }

  error(context: string, message: string, ...data: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(`[${context}]`, message, ...data);
    }
    this.addLog("error", context, message, data);
  }

  clearLogs(): void {
    this.logs.set([]);
  }
}
