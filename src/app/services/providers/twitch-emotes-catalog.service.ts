/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessageEmote } from "@models/chat.model";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { TauriApiService } from "@app/api/tauri-api.service";

export interface TwitchChannelEmote {
  id: string;
  code: string;
  url: string;
}

@Injectable({
  providedIn: "root",
})
export class TwitchEmotesCatalogService {
  private readonly emotesCache = new Map<
    string,
    { emotes: TwitchChannelEmote[]; timestamp: number }
  >();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly tauriApi = inject(TauriApiService);

  async fetchTwitchChannelEmotes(roomId: string): Promise<TwitchChannelEmote[]> {
    const trimmed = roomId?.trim();
    if (!trimmed) {
      return [];
    }

    const cached = this.emotesCache.get(trimmed);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.emotes;
    }

    try {
      const emotes = (await this.tauriApi.twitchFetchChannelEmotes({
        roomId: trimmed,
      })) as TwitchChannelEmote[];

      this.emotesCache.set(trimmed, {
        emotes,
        timestamp: Date.now(),
      });

      this.logger.info("Loaded", {
        source: "TwitchEmotesCatalogService",
        count: emotes.length,
        roomId,
      });

      return emotes;
    } catch (error) {
      this.logger.warn("Failed to fetch Twitch channel emotes", {
        source: "TwitchEmotesCatalogService",
        roomId,
        error,
      });
      return [];
    }
  }

  resolveTwitchChannelEmote(roomId: string | undefined, code: string): TwitchChannelEmote | null {
    if (!roomId || !code) {
      return null;
    }

    const cached = this.emotesCache.get(roomId);
    if (!cached) {
      return null;
    }

    const trimmed = code.trim().toLowerCase();
    return cached.emotes.find((e) => e.code.toLowerCase() === trimmed) ?? null;
  }

  clearCache(roomId?: string): void {
    if (roomId) {
      this.emotesCache.delete(roomId);
    } else {
      this.emotesCache.clear();
    }
  }
}
