/* sys lib */
import { Injectable } from "@angular/core";
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

/** Default TTL for emote cache: 24 hours */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: "root",
})
export class IconsStorageService {
  /**
   * Check if cached data is still valid based on TTL
   */
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
        // Cache expired, clear it
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
        // Cache expired, clear it
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
  }

  clearChannel(roomId: string): void {
    localStorage.removeItem(channelKey(roomId));
  }

  /**
   * Clear all emote caches (global and all channels)
   */
  clearAll(): void {
    localStorage.removeItem(GLOBAL_KEY);
    // Clear all channel caches by iterating localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("unichat-icons-twitch-channel:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}
