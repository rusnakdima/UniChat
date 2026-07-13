/* angular */
import { ApplicationConfig, ErrorHandler } from "@angular/core";
import { provideRouter } from "@angular/router";
/* library */
import { provideUnifiedApp } from "@tauri-front/shared";
/* app:services */
import { GlobalErrorHandler } from "@services/core/global-error-handler.service";
/* app:other */
import { routes } from "@app/app.routes";

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
