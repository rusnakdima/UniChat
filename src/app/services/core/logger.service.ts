import { getLoggingService } from "@tauri-apps/logger";
import { InjectionToken } from "@angular/core";

export const LOGGER_SERVICE = new InjectionToken<ReturnType<typeof getLoggingService>>("LoggerService", {
  factory: () => getLoggingService(),
});

export { getLoggingService };
