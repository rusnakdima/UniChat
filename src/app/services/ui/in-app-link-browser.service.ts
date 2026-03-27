import { Injectable } from "@angular/core";

/**
 * Opens arbitrary http(s) URLs in a **separate Tauri webview window** with a top-level navigation.
 * This is not an iframe: the remote site’s normal page loads inside UniChat, which is what users
 * usually mean by “open the link in the app.”
 */
@Injectable({
  providedIn: "root",
})
export class InAppLinkBrowserService {
  async open(href: string): Promise<void> {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `in-app-link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const host = safeHostname(href);
      const win = new WebviewWindow(label, {
        url: href,
        title: host ? `UniChat · ${host}` : "UniChat",
        width: 1100,
        height: 720,
        center: true,
        parent: "main",
      });
      void win.once("tauri://error", () => {
        void openHrefExternally(href);
      });
    } catch {
      await openHrefExternally(href);
    }
  }
}

function safeHostname(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}

async function openHrefExternally(href: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}
