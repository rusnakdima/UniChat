/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { LocalStorageService } from "@services/core/local-storage.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";

/* models */
import { PlatformType } from "@models/chat.model";
import { KickChannelInfoWithImage, YouTubeChannelInfo } from "@models/platform-api.model";

/* helpers */
import { YOUTUBE_DATA_API_KEY_STORAGE_KEY } from "@helpers/chat.helper";

/**
 * Channel Image Loader Service
 * Loads channel profile images from all platforms (Twitch, Kick, YouTube)
 * Works for both authenticated and watch-only modes
 */
@Injectable({
  providedIn: "root",
})
export class ChannelImageLoaderService {
  private readonly avatarCache = inject(AvatarCacheService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly logger = inject(LoggerService);

  /**
   * Load channel profile image for any platform
   * @param platform - Platform type (twitch, kick, youtube)
   * @param channelName - Channel name/login
   * @param channelId - Channel ID for caching
   * @returns Profile image URL or null
   */
  async loadChannelImage(
    platform: PlatformType,
    channelName: string,
    channelId: string
  ): Promise<string | null> {
    const cacheKey = `${platform}:${channelId}`;

    // Check cache first
    const cached = this.avatarCache.getChannelAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    // Platform-specific loading
    switch (platform) {
      case "twitch":
        return this.loadTwitchChannelImage(channelName, cacheKey);
      case "kick":
        return this.loadKickChannelImage(channelName, cacheKey);
      case "youtube":
        return this.loadYouTubeChannelImage(channelName, cacheKey);
      default:
        return null;
    }
  }

  /**
   * Load Twitch channel profile image
   * Uses GraphQL API (no auth required for public data)
   */
  private async loadTwitchChannelImage(
    channelName: string,
    cacheKey: string
  ): Promise<string | null> {
    try {
      const imageUrl = await this.twitchChat.fetchChannelProfileImage(channelName);
      if (imageUrl) {
        this.avatarCache.setChannelAvatar(cacheKey, imageUrl);
        return imageUrl;
      }
    } catch (error) {
      this.logger.warn(
        "ChannelImageLoaderService",
        "Failed to load Twitch channel image for",
        channelName,
        error
      );
    }
    return null;
  }

  /**
   * Load Kick channel profile image
   * Uses Kick API v1 (no auth required for public data)
   */
  private async loadKickChannelImage(
    channelName: string,
    cacheKey: string
  ): Promise<string | null> {
    try {
      const result = await invoke<KickChannelInfoWithImage>("kickFetchChannelInfo", {
        channelSlug: channelName,
      });

      if (result.profile_pic_url) {
        this.avatarCache.setChannelAvatar(cacheKey, result.profile_pic_url);
        return result.profile_pic_url;
      }
    } catch (error) {
      this.logger.warn(
        "ChannelImageLoaderService",
        "Failed to load Kick channel image for",
        channelName,
        error
      );
    }
    return null;
  }

  /**
   * Load YouTube channel profile image
   * Tries API key first, then OAuth if available
   */
  private async loadYouTubeChannelImage(
    channelName: string,
    cacheKey: string
  ): Promise<string | null> {
    // Try API key first
    const apiKey = this.localStorage.get<string>(YOUTUBE_DATA_API_KEY_STORAGE_KEY, "");
    if (apiKey && apiKey.trim()) {
      try {
        const result = await invoke<YouTubeChannelInfo>("youtubeFetchChannelInfoByApiKey", {
          channel_name: channelName,
          api_key: apiKey,
        });

        if (result.thumbnailUrl) {
          this.avatarCache.setChannelAvatar(cacheKey, result.thumbnailUrl);
          return result.thumbnailUrl;
        }
      } catch (error) {
        this.logger.warn(
          "ChannelImageLoaderService",
          "Failed to load YouTube channel image (API key) for",
          channelName,
          error
        );
      }
    }

    // OAuth method could be added here if needed
    // For now, YouTube channel images require API key
    return null;
  }

  /**
   * Check if channel image is cached
   */
  hasChannelImage(platform: PlatformType, channelId: string): boolean {
    const cacheKey = `${platform}:${channelId}`;
    return this.avatarCache.hasChannelAvatar(cacheKey);
  }

  /**
   * Get cached channel image URL
   */
  getCachedChannelImage(platform: PlatformType, channelId: string): string | null {
    const cacheKey = `${platform}:${channelId}`;
    return this.avatarCache.getChannelAvatar(cacheKey) ?? null;
  }
}
