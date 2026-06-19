import { LogLevel, LogEntry } from "@core/services/logger.service";

export type { LogLevel, LogEntry };

export const logger = {
  debug(message: string, component: string = "app"): void {
    console.debug(`[${component}]`, message);
  },
  warn(message: string, component: string = "app"): void {
    console.warn(`[${component}]`, message);
  },
  error(message: string, component: string = "app"): void {
    console.error(`[${component}]`, message);
  },
  info(message: string, component: string = "app"): void {
    console.info(`[${component}]`, message);
  },
};