/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessageEmote } from "@models/chat.model";
import { KickEmoteInfo } from "@models/platform-api.model";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import { TauriApiService } from "@app/api/tauri-api.service";

/**
 * Kick Emote Loader Service
 * Fetches and caches Kick channel emotes from the Kick API
 */
@Injectable({
  providedIn: "root",
})
export class KickEmoteLoaderService {
  private readonly emotesCache = new Map<
    string,
    { emotes: ChatMessageEmote[]; timestamp: number }
  >();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly tauriApi = inject(TauriApiService);

  /**
   * Fetch emotes for a Kick channel
   * @param channelSlug - Channel name (e.g., "xqc")
   * @returns Array of emotes
   */
  async fetchChannelEmotes(channelSlug: string): Promise<ChatMessageEmote[]> {
    const normalizedSlug = normalizeChannelId("kick", channelSlug);
    const cached = this.emotesCache.get(normalizedSlug);

    // Return cached emotes if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.emotes;
    }

    try {
      const emotesInfo = await this.tauriApi.kickFetchChannelEmotes({
        channelSlug: normalizedSlug,
      }) as KickEmoteInfo[];

      const emotes: ChatMessageEmote[] = emotesInfo.map((info) => ({
        provider: "kick",
        id: String(info.id),
        code: info.name,
        start: 0,
        end: 0,
        url: `https://files.kick.com/images/emotes/${encodeURIComponent(String(info.id))}/full`,
      }));

      // Cache the result
      this.emotesCache.set(normalizedSlug, {
        emotes,
        timestamp: Date.now(),
      });

      this.logger.info(
        "Loaded",
        { source: "KickEmoteLoaderService", emotesCount: emotes.length, channelSlug }
      );

      return emotes;
    } catch (error) {
      this.logger.warn("Failed to fetch emotes", { source: "KickEmoteLoaderService", channelSlug, error });
      return [];
    }
  }

  /**
   * Clear cache for a specific channel
   */
  clearCache(channelSlug: string): void {
    this.emotesCache.delete(normalizeChannelId("kick", channelSlug));
  }

  /**
   * Clear all cached emotes
   */
  clearAllCache(): void {
    this.emotesCache.clear();
  }
}
