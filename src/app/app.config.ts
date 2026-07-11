/* sys lib */
import { ApplicationConfig, ErrorHandler } from "@angular/core";
import { provideUnifiedApp } from "@tauri-front/shared";
import { provideRouter } from "@angular/router";

/* app */
import { routes } from "@app/app.routes";

/* services */
import { GlobalErrorHandler } from "@services/core/global-error-handler.service";

export const appConfig: ApplicationConfig = {
  providers: [
    ...provideUnifiedApp({
      enableBrowserErrorListeners: true,
      enableZoneChangeDetection: true,
    }),
    provideRouter(routes),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
