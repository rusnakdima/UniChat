import "@tauri-front/shared";
import { loadStyleVariantNoop } from "@tauri-front/shared";
import { bootstrapApplication } from "@angular/platform-browser";

/* app:other */
import { App } from "@app/app";
import { appConfig } from "@app/app.config";

loadStyleVariantNoop().then(() => {
  bootstrapApplication(App, appConfig).catch((err) => console.error("Angular bootstrap error:", err));
});
