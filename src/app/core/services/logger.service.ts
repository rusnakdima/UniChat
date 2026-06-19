import { Injectable, InjectionToken } from "@angular/core";

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
}

export interface LogMeta {
  source?: string;
  error?: unknown;
  [key: string]: any;
}

@Injectable({ providedIn: "root" })
export class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private level = LogLevel.Info;

  private format(level: LogLevel, message: string, context?: string, data?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
    };
  }

  debug(message: string, ...args: any[]): void {
    this.logDebug(message, args);
  }

  info(message: string, ...args: any[]): void {
    this.logInfo(message, args);
  }

  warn(message: string, ...args: any[]): void {
    this.logWarn(message, args);
  }

  error(message: string, ...args: any[]): void {
    this.logError(message, args);
  }

  private logDebug(message: string, args: any[]): void {
    if (this.level <= LogLevel.Debug) {
      const [error, meta] = this.parseLogArgs(args);
      this.log(this.format(LogLevel.Debug, message, meta?.source, { error, ...meta }));
    }
  }

  private logInfo(message: string, args: any[]): void {
    if (this.level <= LogLevel.Info) {
      const [error, meta] = this.parseLogArgs(args);
      this.log(this.format(LogLevel.Info, message, meta?.source, { error, ...meta }));
    }
  }

  private logWarn(message: string, args: any[]): void {
    if (this.level <= LogLevel.Warn) {
      const [error, meta] = this.parseLogArgs(args);
      this.log(this.format(LogLevel.Warn, message, meta?.source, { error, ...meta }));
    }
  }

  private logError(message: string, args: any[]): void {
    if (this.level <= LogLevel.Error) {
      const [error, meta] = this.parseLogArgs(args);
      this.log(this.format(LogLevel.Error, message, meta?.source, { error, ...meta }));
    }
  }

  private parseLogArgs(args: any[]): [unknown?, LogMeta?] {
    if (args.length === 0) {
      return [undefined, undefined];
    }
    if (args.length === 1) {
      const arg = args[0];
      if (typeof arg === "string") {
        return [undefined, { source: arg }];
      }
      if (arg && typeof arg === "object") {
        return [undefined, arg as LogMeta];
      }
      return [arg, undefined];
    }
    if (args.length === 2) {
      const [first, second] = args;
      if (typeof first === "string" && second && typeof second === "object") {
        return [undefined, { source: first, ...(second as LogMeta) }];
      }
      if (typeof first === "object" && second !== undefined && typeof second !== "object") {
        return [second, first as LogMeta];
      }
    }
    return [undefined, undefined];
  }

  private log(entry: LogEntry): void {
    console.log(`[${entry.level}] ${entry.message}`, entry.data || "");
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const LOGGER_SERVICE = new InjectionToken<LoggerService>("LOGGER_SERVICE", {
  providedIn: "root",
  factory: () => new LoggerService(),
});

export function getLoggingService(): LoggerService {
  return new LoggerService();
}
