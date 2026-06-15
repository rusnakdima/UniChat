import { Injectable } from "@angular/core";

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

  debug(message: string, context?: string, data?: any): void {
    if (this.level <= LogLevel.Debug) {
      this.log(this.format(LogLevel.Debug, message, context, data));
    }
  }

  info(message: string, context?: string, data?: any): void {
    if (this.level <= LogLevel.Info) {
      this.log(this.format(LogLevel.Info, message, context, data));
    }
  }

  warn(message: string, context?: string, data?: any): void {
    if (this.level <= LogLevel.Warn) {
      this.log(this.format(LogLevel.Warn, message, context, data));
    }
  }

  error(message: string, context?: string, data?: any): void {
    if (this.level <= LogLevel.Error) {
      this.log(this.format(LogLevel.Error, message, context, data));
    }
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

export function getLoggingService(): LoggerService {
  return new LoggerService();
}
