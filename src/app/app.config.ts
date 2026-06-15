/* sys lib */
import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";

/* app */
import { routes } from "@app/app.routes";

/* services */
import { GlobalErrorHandler } from "@services/core/global-error-handler.service";
import { LOGGER_SERVICE, LoggerService } from "@services/core/logger.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: LOGGER_SERVICE, useClass: LoggerService },
  ],
};
