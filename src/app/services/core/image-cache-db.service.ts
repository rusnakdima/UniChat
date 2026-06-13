/**
 * IndexedDB Service for Image Caching
 *
 * Provides persistent storage for avatars, emotes, and badges
 * using base64-encoded image data with 7-day TTL and LRU eviction.
 */

import { Injectable, inject, signal } from "@angular/core";
import { LoggerService } from "@services/core/logger.service";

const DB_NAME = "unichat-image-cache";
const DB_VERSION = 1;
const STORE_AVATARS = "avatars";
const STORE_EMOTES = "emotes";
const STORE_BADGES = "badges";
const MAX_ENTRIES = 2000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type AvatarType = "user" | "channel";

interface AvatarEntry {
  cacheKey: string;
  url: string;
  type: AvatarType;
  fetchedAt: number;
  data: string; // base64
}

interface EmoteEntry {
  emoteKey: string;
  url: string;
  provider: string;
  fetchedAt: number;
  data: string; // base64
}

interface BadgeEntry {
  badgeKey: string;
  url: string;
  fetchedAt: number;
  data: string; // base64
}

@Injectable({
  providedIn: "root",
})
export class ImageCacheDbService {
  private readonly logger = inject(LoggerService);
  private db: IDBDatabase | null = null;
  private isOpening = false;
  private openPromise: Promise<IDBDatabase> | null = null;
  private initialized = false;

  readonly stats = signal({ avatars: 0, emotes: 0, badges: 0, total: 0 });

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.openDb();
      await this.evictExpired();
      await this.updateStats();
      this.initialized = true;
    } catch (e) {
      this.logger.error("ImageCacheDbService", "init failed", e);
    }
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    if (this.isOpening && this.openPromise) return this.openPromise;

    this.isOpening = true;
    this.openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.isOpening = false;
        this.openPromise = null;
        reject(new Error("Failed to open IndexedDB for image cache"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isOpening = false;
        this.openPromise = null;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_AVATARS)) {
          const avatarsStore = db.createObjectStore(STORE_AVATARS, { keyPath: "cacheKey" });
          avatarsStore.createIndex("fetchedAt", "fetchedAt", { unique: false });
          avatarsStore.createIndex("type", "type", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_EMOTES)) {
          const emotesStore = db.createObjectStore(STORE_EMOTES, { keyPath: "emoteKey" });
          emotesStore.createIndex("fetchedAt", "fetchedAt", { unique: false });
          emotesStore.createIndex("provider", "provider", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_BADGES)) {
          const badgesStore = db.createObjectStore(STORE_BADGES, { keyPath: "badgeKey" });
          badgesStore.createIndex("fetchedAt", "fetchedAt", { unique: false });
        }
      };
    });

    return this.openPromise;
  }

  async getAvatar(cacheKey: string): Promise<AvatarEntry | null> {
    try {
      const db = await this.openDb();
      return this.getFromStore<AvatarEntry>(db, STORE_AVATARS, cacheKey);
    } catch (e) {
      this.logger.error("ImageCacheDbService", "getAvatar failed", e);
      return null;
    }
  }

  async setAvatar(
    cacheKey: string,
    url: string,
    type: AvatarType,
    base64Data: string
  ): Promise<void> {
    try {
      const db = await this.openDb();
      const entry: AvatarEntry = {
        cacheKey,
        url,
        type,
        fetchedAt: Date.now(),
        data: base64Data,
      };
      await this.putToStore(db, STORE_AVATARS, cacheKey, entry);
      await this.enforceMaxEntries(db, STORE_AVATARS);
      this.updateStatsSilently();
    } catch (e) {
      this.logger.error("ImageCacheDbService", "setAvatar failed", e);
    }
  }

  async getEmote(emoteKey: string): Promise<EmoteEntry | null> {
    try {
      const db = await this.openDb();
      return this.getFromStore<EmoteEntry>(db, STORE_EMOTES, emoteKey);
    } catch (e) {
      this.logger.error("ImageCacheDbService", "getEmote failed", e);
      return null;
    }
  }

  async setEmote(
    emoteKey: string,
    url: string,
    provider: string,
    base64Data: string
  ): Promise<void> {
    try {
      const db = await this.openDb();
      const entry: EmoteEntry = {
        emoteKey,
        url,
        provider,
        fetchedAt: Date.now(),
        data: base64Data,
      };
      await this.putToStore(db, STORE_EMOTES, emoteKey, entry);
      await this.enforceMaxEntries(db, STORE_EMOTES);
      this.updateStatsSilently();
    } catch (e) {
      this.logger.error("ImageCacheDbService", "setEmote failed", e);
    }
  }

  async getBadge(badgeKey: string): Promise<BadgeEntry | null> {
    try {
      const db = await this.openDb();
      return this.getFromStore<BadgeEntry>(db, STORE_BADGES, badgeKey);
    } catch (e) {
      this.logger.error("ImageCacheDbService", "getBadge failed", e);
      return null;
    }
  }

  async setBadge(badgeKey: string, url: string, base64Data: string): Promise<void> {
    try {
      const db = await this.openDb();
      const entry: BadgeEntry = {
        badgeKey,
        url,
        fetchedAt: Date.now(),
        data: base64Data,
      };
      await this.putToStore(db, STORE_BADGES, badgeKey, entry);
      await this.enforceMaxEntries(db, STORE_BADGES);
      this.updateStatsSilently();
    } catch (e) {
      this.logger.error("ImageCacheDbService", "setBadge failed", e);
    }
  }

  async evictExpired(): Promise<void> {
    try {
      const db = await this.openDb();
      const cutoff = Date.now() - TTL_MS;

      await this.deleteExpiredInStore(db, STORE_AVATARS, cutoff);
      await this.deleteExpiredInStore(db, STORE_EMOTES, cutoff);
      await this.deleteExpiredInStore(db, STORE_BADGES, cutoff);
    } catch (e) {
      this.logger.error("ImageCacheDbService", "evictExpired failed", e);
    }
  }

  async evictLRU(): Promise<void> {
    try {
      const db = await this.openDb();
      await this.evictLRUFromStore(db, STORE_AVATARS);
      await this.evictLRUFromStore(db, STORE_EMOTES);
      await this.evictLRUFromStore(db, STORE_BADGES);
    } catch (e) {
      this.logger.error("ImageCacheDbService", "evictLRU failed", e);
    }
  }

  async clearAll(): Promise<void> {
    try {
      const db = await this.openDb();
      await this.clearStore(db, STORE_AVATARS);
      await this.clearStore(db, STORE_EMOTES);
      await this.clearStore(db, STORE_BADGES);
      this.stats.set({ avatars: 0, emotes: 0, badges: 0, total: 0 });
    } catch (e) {
      this.logger.error("ImageCacheDbService", "clearAll failed", e);
    }
  }

  async updateStats(): Promise<void> {
    try {
      const db = await this.openDb();
      const avatars = await this.countInStore(db, STORE_AVATARS);
      const emotes = await this.countInStore(db, STORE_EMOTES);
      const badges = await this.countInStore(db, STORE_BADGES);
      this.stats.set({ avatars, emotes, badges, total: avatars + emotes + badges });
    } catch (e) {
      this.logger.error("ImageCacheDbService", "updateStats failed", e);
    }
  }

  isAvailable(): boolean {
    return typeof indexedDB !== "undefined";
  }

  private async getFromStore<T>(
    db: IDBDatabase,
    storeName: string,
    key: string
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as T | undefined;
        if (result && this.isExpired(result)) {
          this.deleteFromStore(db, storeName, key);
          resolve(null);
        } else {
          resolve(result ?? null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async putToStore(
    db: IDBDatabase,
    storeName: string,
    key: string,
    value: unknown
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromStore(db: IDBDatabase, storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteExpiredInStore(
    db: IDBDatabase,
    storeName: string,
    cutoff: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const index = store.index("fetchedAt");
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async evictLRUFromStore(db: IDBDatabase, storeName: string): Promise<void> {
    const count = await this.countInStore(db, storeName);
    if (count <= MAX_ENTRIES) return;

    const toDelete = count - MAX_ENTRIES + 1;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const index = store.index("fetchedAt");
      const request = index.openCursor();

      let deleted = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async enforceMaxEntries(db: IDBDatabase, storeName: string): Promise<void> {
    const count = await this.countInStore(db, storeName);
    if (count > MAX_ENTRIES) {
      await this.evictLRUFromStore(db, storeName);
    }
  }

  private async clearStore(db: IDBDatabase, storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async countInStore(db: IDBDatabase, storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private isExpired(entry: { fetchedAt?: number }): boolean {
    if (!entry.fetchedAt) return false;
    return Date.now() - entry.fetchedAt > TTL_MS;
  }

  private updateStatsSilently(): void {
    this.updateStats().catch(() => {});
  }

  close(): void {
    this.db = null;
    this.isOpening = false;
    this.openPromise = null;
    this.initialized = false;
  }
}
