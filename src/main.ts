/* sys lib */
import "@tauri-front/shared"; // Registers all Lit web components
import { bootstrapApplication } from "@angular/platform-browser";

/* app */
import { App } from "@app/app";
import { appConfig } from "@app/app.config";
bootstrapApplication(App, appConfig).catch((err) => console.error("Angular bootstrap error:", err));
