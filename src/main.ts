import "@tauri-front/shared";
import { loadStyleVariant } from "@tauri-front/shared";
import { bootstrapApplication } from "@angular/platform-browser";

/* app:other */
import { App } from "@app/app";
import { appConfig } from "@app/app.config";

loadStyleVariant("material-design-v3").then(() => {
  bootstrapApplication(App, appConfig).catch((err) =>
    console.error("Angular bootstrap error:", err)
  );
});
