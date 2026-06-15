/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ImageCacheDbService, AvatarType } from "@services/core/image-cache-db.service";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { imageToBase64, isValidBase64Image } from "@shared/utils/image-to-base64.util";

interface CacheEntry {
  url: string;
  timestamp: number;
  base64Data?: string;
}

const DEFAULT_MAX_SIZE = 500;
const DEFAULT_TTL_MS = 30 * 60 * 1000;

const AVATAR_CACHE_CONFIG = {
  maxSize: DEFAULT_MAX_SIZE,
  ttlMs: DEFAULT_TTL_MS,
};

@Injectable({
  providedIn: "root",
})
export class AvatarCacheService {
  private readonly imageDb = inject(ImageCacheDbService);
  private readonly logger = inject(LOGGER_SERVICE);
  private userCache = new Map<string, CacheEntry>();
  private channelCache = new Map<string, CacheEntry>();
  private maxSize = AVATAR_CACHE_CONFIG.maxSize;
  private ttlMs = AVATAR_CACHE_CONFIG.ttlMs;
  private dbInitialized = false;

  private async ensureDbInitialized(): Promise<void> {
    if (this.dbInitialized) return;
    await this.imageDb.ensureInitialized();
    this.dbInitialized = true;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }

  private evictIfNeeded(cache: Map<string, CacheEntry>): void {
    while (cache.size >= this.maxSize) {
      const oldestKey = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .find(([, entry]) => this.isExpired(entry))?.[0];
      if (oldestKey) {
        cache.delete(oldestKey);
      } else {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }
    }
  }

  getUserAvatar(key: string): string | undefined {
    const entry = this.userCache.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.userCache.delete(key);
      return undefined;
    }
    if (entry.base64Data && isValidBase64Image(entry.base64Data)) {
      return entry.base64Data;
    }
    return entry.url;
  }

  async getUserAvatarAsync(key: string): Promise<string | undefined> {
    const cached = this.getUserAvatar(key);
    if (cached) return cached;

    await this.ensureDbInitialized();
    const dbEntry = await this.imageDb.getAvatar(key);
    if (dbEntry) {
      this.userCache.set(key, {
        url: dbEntry.url,
        timestamp: Date.now(),
        base64Data: dbEntry.data,
      });
      return dbEntry.data;
    }
    return undefined;
  }

  setUserAvatar(key: string, url: string): void {
    this.evictIfNeeded(this.userCache);
    this.userCache.set(key, { url, timestamp: Date.now() });
    this.persistToDb(key, url, "user");
  }

  setUserAvatarWithBase64(key: string, url: string, base64Data: string): void {
    this.evictIfNeeded(this.userCache);
    this.userCache.set(key, { url, timestamp: Date.now(), base64Data });
  }

  getChannelAvatar(key: string): string | undefined {
    const entry = this.channelCache.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.channelCache.delete(key);
      return undefined;
    }
    if (entry.base64Data && isValidBase64Image(entry.base64Data)) {
      return entry.base64Data;
    }
    return entry.url;
  }

  async getChannelAvatarAsync(key: string): Promise<string | undefined> {
    const cached = this.getChannelAvatar(key);
    if (cached) return cached;

    await this.ensureDbInitialized();
    const dbEntry = await this.imageDb.getAvatar(key);
    if (dbEntry) {
      this.channelCache.set(key, {
        url: dbEntry.url,
        timestamp: Date.now(),
        base64Data: dbEntry.data,
      });
      return dbEntry.data;
    }
    return undefined;
  }

  setChannelAvatar(key: string, url: string): void {
    this.evictIfNeeded(this.channelCache);
    this.channelCache.set(key, { url, timestamp: Date.now() });
    this.persistToDb(key, url, "channel");
  }

  setChannelAvatarWithBase64(key: string, url: string, base64Data: string): void {
    this.evictIfNeeded(this.channelCache);
    this.channelCache.set(key, { url, timestamp: Date.now(), base64Data });
  }

  hasUserAvatar(key: string): boolean {
    return !!this.getUserAvatar(key);
  }

  hasChannelAvatar(key: string): boolean {
    return !!this.getChannelAvatar(key);
  }

  clear(): void {
    this.userCache.clear();
    this.channelCache.clear();
  }

  clearUserCache(): void {
    this.userCache.clear();
  }

  clearChannelCache(): void {
    this.channelCache.clear();
  }

  getStats(): { userCacheSize: number; channelCacheSize: number } {
    return {
      userCacheSize: this.userCache.size,
      channelCacheSize: this.channelCache.size,
    };
  }

  private async persistToDb(key: string, url: string, type: AvatarType): Promise<void> {
    try {
      await this.ensureDbInitialized();
      const base64Data = await imageToBase64(url);
      await this.imageDb.setAvatar(key, url, type, base64Data);
    } catch (e) {
      this.logger.warn("Failed to persist avatar to IndexedDB", {
        source: "AvatarCacheService",
        error: e,
      });
    }
  }
}
