import { inject, Injectable, signal } from "@angular/core";
import { InAppLinkBrowserService } from "@services/ui/in-app-link-browser.service";

export interface LinkPreviewState {
  /** Raw matched text in the message (may omit scheme). */
  displayUrl: string;
  /** Normalized http(s) URL for iframe / browser. */
  href: string;
}

@Injectable({
  providedIn: "root",
})
export class LinkPreviewService {
  private readonly inAppBrowser = inject(InAppLinkBrowserService);
  private readonly stateSignal = signal<LinkPreviewState | null>(null);

  readonly state = this.stateSignal.asReadonly();

  open(raw: string): void {
    const href = normalizeChatLinkHref(raw);
    if (!href) {
      return;
    }
    this.openResolved(raw.trim(), href);
  }

  /**
   * When the URL cannot be shown in the preview iframe (Twitch clips, Discord, YouTube @channels,
   * etc.), open it in a **separate UniChat window** with a normal top-level page load — not an
   * iframe, so framing headers do not apply. Only URLs we can legally embed (e.g. YouTube
   * `/embed/`) use the modal iframe.
   */
  openResolved(displayUrl: string, href: string): void {
    if (getLinkPreviewIframeSrc(href) === null) {
      void this.inAppBrowser.open(href);
      return;
    }
    this.stateSignal.set({ displayUrl: displayUrl.trim(), href });
  }

  close(): void {
    this.stateSignal.set(null);
  }
}

export function isTwitchFamilyHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "twitch.tv" || h.endsWith(".twitch.tv");
}

/** Allow only http(s); trim trailing punctuation often glued to URLs in chat. */
export function normalizeChatLinkHref(raw: string): string | null {
  let candidate = raw.trim().replace(/[),.;:!?]+$/u, "");
  if (candidate.startsWith("www.")) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * URL safe to load inside the modal iframe. When this returns `null`, `LinkPreviewService` opens
 * a separate UniChat window (top-level page, not an iframe). YouTube watch/shorts become `/embed/…`;
 * channel @pages, Discord, Telegram, Twitch, etc. are not iframe-embeddable.
 */
export function getLinkPreviewIframeSrc(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const ytEmbed = tryYoutubeEmbedUrl(url);
  if (ytEmbed) {
    return ytEmbed;
  }

  const host = url.hostname.toLowerCase();

  if (isHardNonEmbeddableHost(host)) {
    return null;
  }

  if (isYoutubeFamilyHost(host)) {
    return null;
  }

  return href;
}

/** @deprecated use `getLinkPreviewIframeSrc(href) === null` */
export function isUrlLikelyBlockedInIframe(href: string): boolean {
  return getLinkPreviewIframeSrc(href) === null;
}

function isYoutubeFamilyHost(host: string): boolean {
  return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
}

function tryYoutubeEmbedUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!isYoutubeFamilyHost(host)) {
    return null;
  }

  const id = extractYoutubeVideoId(url, host);
  if (!id || !/^[\w-]{11}$/.test(id)) {
    return null;
  }
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
}

function extractYoutubeVideoId(url: URL, host: string): string | null {
  if (host === "youtu.be") {
    const seg = url.pathname.split("/").filter(Boolean)[0];
    return seg ?? null;
  }

  const path = url.pathname;
  const fromQuery = url.searchParams.get("v");
  if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) {
    return fromQuery;
  }

  const embed = path.match(/^\/embed\/([\w-]{11})(?:\/|$)/);
  if (embed?.[1]) {
    return embed[1];
  }
  const shorts = path.match(/^\/shorts\/([\w-]{11})(?:\/|$)/);
  if (shorts?.[1]) {
    return shorts[1];
  }
  const live = path.match(/^\/live\/([\w-]{11})(?:\/|$)/);
  if (live?.[1]) {
    return live[1];
  }
  const watchPath = path.match(/^\/watch\/([\w-]{11})(?:\/|$)/);
  if (watchPath?.[1]) {
    return watchPath[1];
  }
  return null;
}

function isHardNonEmbeddableHost(host: string): boolean {
  if (isTwitchFamilyHost(host)) {
    return true;
  }
  if (host === "discord.com" || host.endsWith(".discord.com")) {
    return true;
  }
  if (host === "discord.gg" || host.endsWith(".discord.gg")) {
    return true;
  }
  if (host === "discordapp.com" || host.endsWith(".discordapp.com")) {
    return true;
  }
  if (host === "t.me" || host.endsWith(".t.me")) {
    return true;
  }
  if (host === "telegram.me" || host.endsWith(".telegram.me")) {
    return true;
  }
  if (host === "telegram.org" || host.endsWith(".telegram.org")) {
    return true;
  }
  if (host === "twitter.com" || host.endsWith(".twitter.com")) {
    return true;
  }
  if (host === "x.com" || host === "www.x.com") {
    return true;
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return true;
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    return true;
  }
  if (host === "boosty.to" || host.endsWith(".boosty.to")) {
    return true;
  }
  return false;
}
