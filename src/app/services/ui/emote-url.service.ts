/* sys lib */
import { Injectable } from "@angular/core";
/**
 * Centralized service for generating emote and badge URLs
 * Consolidates URL generation logic from multiple provider services
 */
@Injectable({
  providedIn: "root",
})
export class EmoteUrlService {
  /**
   * Generate Twitch emote URL
   * @param emoteId - Twitch emote ID
   * @param size - Emote size: '1.0' (28x28), '2.0' (56x56), '3.0' (112x112)
   * @param theme - 'dark' or 'light'
   * @returns Full CDN URL
   */
  getTwitchEmote(emoteId: string, size: string = "1.0", theme: "dark" | "light" = "dark"): string {
    return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emoteId)}/default/${theme}/${size}`;
  }

  /**
   * Generate Twitch badge URL
   * @param badgeKey - Badge identifier (e.g., 'subscriber', 'moderator')
   * @param version - Badge version (e.g., '0', '1')
   * @returns Full CDN URL
   */
  getTwitchBadge(badgeKey: string, version: string): string {
    return `https://static-cdn.jtvnw.net/badges/v1/${encodeURIComponent(badgeKey)}/${version}`;
  }

  /**
   * Generate Twitch user profile image URL
   * @param username - Twitch username/login name
   * @param size - Image size: '300x300', '600x600'
   * @returns Full CDN URL
   */
  getTwitchProfileImage(username: string, size: string = "300x300"): string {
    return `https://static-cdn.jtvnw.net/jtv_user_pictures/${encodeURIComponent(username.toLowerCase())}-profile_image-${size}.png`;
  }

  /**
   * Generate Kick emote URL
   * @param emoteId - Kick emote ID
   * @returns Full CDN URL
   */
  getKickEmote(emoteId: string): string {
    // Kick emote URL pattern - adjust if API changes
    return `https://files.kick.com/images/emotes/${encodeURIComponent(emoteId)}/full`;
  }

  /**
   * Generate YouTube emoji URL
   * @param emojiId - YouTube emoji/emoji ID
   * @returns Full CDN URL
   */
  getYouTubeEmoji(emojiId: string): string {
    // YouTube emoji URL pattern - adjust based on actual API
    return `https://www.youtube.com/emoji?emoji=${encodeURIComponent(emojiId)}`;
  }

  /**
   * Parse Twitch emote set and generate URLs
   * @param emoteSet - Comma-separated emote IDs with positions (e.g., "25:0-9,15-19")
   * @returns Array of emote objects with IDs and URLs
   */
  parseTwitchEmoteSet(emoteSet: string): Array<{ id: string; url: string }> {
    if (!emoteSet) return [];

    const emotes: Array<{ id: string; url: string }> = [];
    const parts = emoteSet.split("/");

    for (const part of parts) {
      const [emoteId] = part.split(":");
      if (emoteId) {
        emotes.push({
          id: emoteId,
          url: this.getTwitchEmote(emoteId),
        });
      }
    }

    return emotes;
  }

  /**
   * Get emote URL with fallback
   * @param platform - Platform type
   * @param emoteId - Emote ID
   * @param fallback - Fallback URL if platform not supported
   * @returns Emote URL or fallback
   */
  getEmoteUrl(platform: string, emoteId: string, fallback?: string): string {
    switch (platform) {
      case "twitch":
        return this.getTwitchEmote(emoteId);
      case "kick":
        return this.getKickEmote(emoteId);
      case "youtube":
        return this.getYouTubeEmoji(emoteId);
      default:
        return fallback || emoteId;
    }
  }
}
