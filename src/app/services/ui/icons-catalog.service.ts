/* sys lib */
import {
  IconsBadgeIcon,
  IconsEmoteIcon,
  IconsPayload,
  IconsPayloadWithMeta,
  IconsStorageService,
} from "./icons-storage.service";
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
export interface ResolveSevenTvEmoteResult {
  id: string;
  url: string;
}

export interface ResolveTwitchBadgeResult {
  id: string;
  label: string;
  url: string;
}

@Injectable({
  providedIn: "root",
})
export class IconsCatalogService {
  private readonly storage = inject(IconsStorageService);

  private globalEmotes: Record<string, IconsEmoteIcon> = {};
  private globalBadges: Record<string, IconsBadgeIcon> = {};
  private globalLoaded = false;
  private globalLoadPromise: Promise<void> | null = null;

  private channelEmotesByRoom = new Map<string, Record<string, IconsEmoteIcon>>();
  private channelBadgesByRoom = new Map<string, Record<string, IconsBadgeIcon>>();
  private channelLoaded = new Set<string>();
  private channelLoadPromises = new Map<string, Promise<void>>();

  /** TTL for emote cache: 24 hours (matches IconsStorageService) */
  private static readonly fetchedAtStaleMs = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly errorBackoffMs = 15 * 60 * 1000; // 15 minutes

  private emptyPayloadWithBackoff(): IconsPayloadWithMeta {
    // We intentionally set fetchedAtMs so `isStale()` becomes true after `errorBackoffMs`,
    // preventing an immediate tight retry loop, but still allowing recovery later.
    const pseudoFetchedAtMs =
      Date.now() - (IconsCatalogService.fetchedAtStaleMs - IconsCatalogService.errorBackoffMs);
    return {
      emotes: {},
      badges: {},
      fetchedAtMs: pseudoFetchedAtMs,
    };
  }

  async ensureGlobalLoaded(): Promise<void> {
    if (this.globalLoaded) {
      return;
    }

    if (this.globalLoadPromise) {
      await this.globalLoadPromise;
      return;
    }

    const stored = this.storage.getGlobal(IconsCatalogService.fetchedAtStaleMs);
    if (stored && !this.isStale(stored.fetchedAtMs)) {
      this.globalEmotes = stored.emotes;
      this.globalBadges = stored.badges;
      this.globalLoaded = true;
      return;
    }

    this.globalLoadPromise = (async () => {
      try {
        const res = await invoke<IconsPayload>("twitchFetchGlobalIcons");
        const payloadWithMeta: IconsPayloadWithMeta = {
          ...res,
          fetchedAtMs: Date.now(),
        };
        this.storage.setGlobal(payloadWithMeta);

        this.globalEmotes = payloadWithMeta.emotes;
        this.globalBadges = payloadWithMeta.badges;
        this.globalLoaded = true;
      } catch (err) {
        // Avoid re-triggering network calls on every failed render/reload.
        console.error("IconsCatalogService.ensureGlobalLoaded failed", err);
        const empty = this.emptyPayloadWithBackoff();
        this.storage.setGlobal(empty);
        this.globalEmotes = empty.emotes;
        this.globalBadges = empty.badges;
        this.globalLoaded = true;
      } finally {
        this.globalLoadPromise = null;
      }
    })();

    await this.globalLoadPromise;
  }

  async ensureChannelLoaded(roomId: string): Promise<void> {
    const rid = roomId?.trim();
    if (!rid) {
      return;
    }
    if (this.channelLoaded.has(rid)) {
      return;
    }

    const existing = this.channelLoadPromises.get(rid);
    if (existing) {
      await existing;
      return;
    }

    const stored = this.storage.getChannel(rid, IconsCatalogService.fetchedAtStaleMs);
    if (stored && !this.isStale(stored.fetchedAtMs)) {
      this.channelEmotesByRoom.set(rid, stored.emotes);
      this.channelBadgesByRoom.set(rid, stored.badges);
      this.channelLoaded.add(rid);
      return;
    }

    const loadPromise = (async () => {
      try {
        const res = await invoke<IconsPayload>("twitchFetchChannelIcons", { roomId: rid });
        const payloadWithMeta: IconsPayloadWithMeta = {
          ...res,
          fetchedAtMs: Date.now(),
        };
        this.storage.setChannel(rid, payloadWithMeta);
        this.channelEmotesByRoom.set(rid, payloadWithMeta.emotes);
        this.channelBadgesByRoom.set(rid, payloadWithMeta.badges);
        this.channelLoaded.add(rid);
      } catch (err) {
        console.error("IconsCatalogService.ensureChannelLoaded failed", err);
        const empty = this.emptyPayloadWithBackoff();
        this.storage.setChannel(rid, empty);
        this.channelEmotesByRoom.set(rid, empty.emotes);
        this.channelBadgesByRoom.set(rid, empty.badges);
        this.channelLoaded.add(rid);
      } finally {
        this.channelLoadPromises.delete(rid);
      }
    })();

    this.channelLoadPromises.set(rid, loadPromise);
    await loadPromise;
  }

  resolveSevenTvEmote(
    twitchRoomId: string | undefined,
    code: string
  ): ResolveSevenTvEmoteResult | null {
    const trimmed = code?.trim();
    if (!trimmed) {
      return null;
    }

    const channel = twitchRoomId ? this.channelEmotesByRoom.get(twitchRoomId) : undefined;
    const inChannel = channel?.[trimmed];
    if (inChannel) {
      return inChannel;
    }

    const inGlobal = this.globalEmotes[trimmed];
    return inGlobal ?? null;
  }

  resolveTwitchBadgeIcon(
    twitchRoomId: string | undefined,
    badgeKey: string,
    badgeVersion: string
  ): ResolveTwitchBadgeResult | null {
    if (!badgeKey || !badgeVersion) {
      return null;
    }

    const compoundKey = `${badgeKey}/${badgeVersion}`;

    const channelBadges = twitchRoomId ? this.channelBadgesByRoom.get(twitchRoomId) : undefined;
    const inChannel = channelBadges?.[compoundKey];
    if (inChannel) {
      return inChannel;
    }

    const inGlobal = this.globalBadges[compoundKey];
    return inGlobal ?? null;
  }

  private isStale(fetchedAtMs: number): boolean {
    return Date.now() - fetchedAtMs > IconsCatalogService.fetchedAtStaleMs;
  }

  /**
   * Clear emote cache and force refresh on next load
   */
  clearCache(): void {
    this.storage.clearAll();
    this.globalEmotes = {};
    this.globalBadges = {};
    this.globalLoaded = false;
    this.globalLoadPromise = null;
    this.channelEmotesByRoom.clear();
    this.channelBadgesByRoom.clear();
    this.channelLoaded.clear();
    this.channelLoadPromises.clear();
  }

  /**
   * Check if cache is stale
   */
  isCacheStale(): boolean {
    const global = this.storage.getGlobal(IconsCatalogService.fetchedAtStaleMs);
    return !global || this.isStale(global.fetchedAtMs);
  }
}
