/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ImageCacheDbService } from "@services/core/image-cache-db.service";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { imageToBase64 } from "@shared/utils/image-to-base64.util";
export interface IconsEmoteIcon {
  id: string;
  url: string;
}

export interface IconsBadgeIcon {
  id: string;
  label: string;
  url: string;
}

export interface IconsPayload {
  emotes: Record<string, IconsEmoteIcon>; // key: emote code/name
  badges: Record<string, IconsBadgeIcon>; // key: `${badgeKey}/${badgeVersion}`
}

export interface IconsPayloadWithMeta extends IconsPayload {
  fetchedAtMs: number;
}

const GLOBAL_KEY = "unichat-icons-global";
function channelKey(roomId: string): string {
  return `unichat-icons-twitch-channel:${roomId}`;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: "root",
})
export class IconsStorageService {
  private readonly imageDb = inject(ImageCacheDbService);
  private readonly logger = inject(LOGGER_SERVICE);
  private dbInitialized = false;
  private initPromise: Promise<void> | null = null;

  private async ensureDbInitialized(): Promise<void> {
    if (this.dbInitialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.imageDb.ensureInitialized().finally(() => {
      this.dbInitialized = true;
      this.initPromise = null;
    });
    await this.initPromise;
  }

  private isCacheValid(fetchedAtMs: number, ttlMs: number = DEFAULT_TTL_MS): boolean {
    const now = Date.now();
    return now - fetchedAtMs < ttlMs;
  }

  getGlobal(ttlMs?: number): IconsPayloadWithMeta | null {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (!raw) {
      return null;
    }
    try {
      const payload = JSON.parse(raw) as IconsPayloadWithMeta;
      if (!this.isCacheValid(payload.fetchedAtMs, ttlMs)) {
        localStorage.removeItem(GLOBAL_KEY);
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  setGlobal(payload: IconsPayloadWithMeta): void {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(payload));
    this.cacheEmotesAndBadges(payload.emotes, payload.badges, "global");
  }

  clearGlobal(): void {
    localStorage.removeItem(GLOBAL_KEY);
  }

  getChannel(roomId: string, ttlMs?: number): IconsPayloadWithMeta | null {
    const raw = localStorage.getItem(channelKey(roomId));
    if (!raw) {
      return null;
    }
    try {
      const payload = JSON.parse(raw) as IconsPayloadWithMeta;
      if (!this.isCacheValid(payload.fetchedAtMs, ttlMs)) {
        localStorage.removeItem(channelKey(roomId));
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  setChannel(roomId: string, payload: IconsPayloadWithMeta): void {
    localStorage.setItem(channelKey(roomId), JSON.stringify(payload));
    this.cacheEmotesAndBadges(payload.emotes, payload.badges, `channel:${roomId}`);
  }

  clearChannel(roomId: string): void {
    localStorage.removeItem(channelKey(roomId));
  }

  clearAll(): void {
    localStorage.removeItem(GLOBAL_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("unichat-icons-twitch-channel:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  async getCachedEmoteUrl(emoteKey: string, fallbackUrl: string): Promise<string> {
    try {
      await this.ensureDbInitialized();
      const cached = await this.imageDb.getEmote(emoteKey);
      if (cached?.data) {
        return cached.data;
      }
      const base64 = await imageToBase64(fallbackUrl);
      await this.imageDb.setEmote(emoteKey, fallbackUrl, "twitch", base64);
      return base64;
    } catch (e) {
      this.logger.warn("Failed to cache emote", { source: "IconsStorageService", emoteKey }, e);
      return fallbackUrl;
    }
  }

  async getCachedBadgeUrl(badgeKey: string, fallbackUrl: string): Promise<string> {
    try {
      await this.ensureDbInitialized();
      const cached = await this.imageDb.getBadge(badgeKey);
      if (cached?.data) {
        return cached.data;
      }
      const base64 = await imageToBase64(fallbackUrl);
      await this.imageDb.setBadge(badgeKey, fallbackUrl, base64);
      return base64;
    } catch (e) {
      this.logger.warn("Failed to cache badge", { source: "IconsStorageService", badgeKey }, e);
      return fallbackUrl;
    }
  }

  private cacheEmotesAndBadges(
    emotes: Record<string, IconsEmoteIcon>,
    badges: Record<string, IconsBadgeIcon>,
    scope: string
  ): void {
    for (const [code, emote] of Object.entries(emotes)) {
      if (!code || !emote?.url) continue;
      const emoteKey = `${scope}:${code}`;
      this.cacheEmoteImage(emoteKey, emote.url).catch(() => {});
    }
    for (const [key, badge] of Object.entries(badges)) {
      if (!key || !badge?.url) continue;
      const badgeKey = `${scope}:${key}`;
      this.cacheBadgeImage(badgeKey, badge.url).catch(() => {});
    }
  }

  private async cacheEmoteImage(emoteKey: string, url: string): Promise<void> {
    try {
      await this.ensureDbInitialized();
      const existing = await this.imageDb.getEmote(emoteKey);
      if (existing?.data) return;
      const base64 = await imageToBase64(url);
      await this.imageDb.setEmote(emoteKey, url, "twitch", base64);
    } catch (e) {
      this.logger.warn("Failed to cache emote image", { source: "IconsStorageService", emoteKey }, e);
    }
  }

  private async cacheBadgeImage(badgeKey: string, url: string): Promise<void> {
    try {
      await this.ensureDbInitialized();
      const existing = await this.imageDb.getBadge(badgeKey);
      if (existing?.data) return;
      const base64 = await imageToBase64(url);
      await this.imageDb.setBadge(badgeKey, url, base64);
    } catch (e) {
      this.logger.warn("Failed to cache badge image", { source: "IconsStorageService", badgeKey }, e);
    }
  }
}
