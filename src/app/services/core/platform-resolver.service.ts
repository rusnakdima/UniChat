import { Injectable } from "@angular/core";
import { PlatformType, PlatformCapabilities, PlatformStatus, ConnectionMode, WidgetStatus } from "@models/chat.model";

/**
 * Platform metadata and configuration
 */
export interface PlatformMetadata {
  id: PlatformType;
  displayName: string;
  shortName: string;
  color: string;
  iconSvg: string;
  capabilities: PlatformCapabilities;
  features: PlatformFeatures;
}

/**
 * Platform-specific features
 */
export interface PlatformFeatures {
  supportsLiveChat: boolean;
  supportsHistoricalChat: boolean;
  supportsEmotes: boolean;
  supportsBadges: boolean;
  supportsMemberships: boolean;
  supportsSuperChats: boolean;
  requiresOAuth: boolean;
  oauthScopes: string[];
}

/**
 * Platform Resolver Service - Centralized Platform Logic
 *
 * Responsibility: Provides centralized platform-specific configuration and utilities.
 * Replaces scattered platform logic across multiple services and helpers.
 *
 * Features:
 * - Platform metadata (display names, colors, icons)
 * - Capability detection
 * - Feature flags per platform
 * - Badge styling centralization
 * - Status label centralization
 */
@Injectable({
  providedIn: "root",
})
export class PlatformResolverService {
  private readonly platforms: Record<PlatformType, PlatformMetadata> = {
    twitch: {
      id: "twitch",
      displayName: "Twitch",
      shortName: "Twitch",
      color: "#9146FF",
      iconSvg: this.getTwitchIcon(),
      capabilities: {
        canListen: true,
        canReply: true,
        canDelete: true,
      },
      features: {
        supportsLiveChat: true,
        supportsHistoricalChat: true, // Via Robotty
        supportsEmotes: true,
        supportsBadges: true,
        supportsMemberships: true,
        supportsSuperChats: false,
        requiresOAuth: true,
        oauthScopes: [
          "chat:read",
          "chat:edit",
          "whispers:read",
          "whispers:edit",
          "moderator:manage:banned_users",
        ],
      },
    },
    kick: {
      id: "kick",
      displayName: "Kick",
      shortName: "Kick",
      color: "#53FC18",
      iconSvg: this.getKickIcon(),
      capabilities: {
        canListen: true,
        canReply: true,
        canDelete: false,
      },
      features: {
        supportsLiveChat: true,
        supportsHistoricalChat: false,
        supportsEmotes: true,
        supportsBadges: true,
        supportsMemberships: false,
        supportsSuperChats: false,
        requiresOAuth: true,
        oauthScopes: ["chat:read", "chat:edit"],
      },
    },
    youtube: {
      id: "youtube",
      displayName: "YouTube Live",
      shortName: "YouTube",
      color: "#FF0000",
      iconSvg: this.getYoutubeIcon(),
      capabilities: {
        canListen: true,
        canReply: true,
        canDelete: true,
      },
      features: {
        supportsLiveChat: true,
        supportsHistoricalChat: false,
        supportsEmotes: false, // Placeholder
        supportsBadges: true,
        supportsMemberships: true,
        supportsSuperChats: true,
        requiresOAuth: true,
        oauthScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      },
    },
  };

  /**
   * Get metadata for a specific platform
   */
  getPlatform(platform: PlatformType): PlatformMetadata {
    return this.platforms[platform];
  }

  /**
   * Get display name for a platform
   */
  getDisplayName(platform: PlatformType): string {
    return this.platforms[platform].displayName;
  }

  /**
   * Get short name for a platform
   */
  getShortName(platform: PlatformType): string {
    return this.platforms[platform].shortName;
  }

  /**
   * Get platform color
   */
  getColor(platform: PlatformType): string {
    return this.platforms[platform].color;
  }

  /**
   * Get platform icon SVG
   */
  getIcon(platform: PlatformType): string {
    return this.platforms[platform].iconSvg;
  }

  /**
   * Get platform capabilities
   */
  getCapabilities(platform: PlatformType): PlatformCapabilities {
    return this.platforms[platform].capabilities;
  }

  /**
   * Get platform features
   */
  getFeatures(platform: PlatformType): PlatformFeatures {
    return this.platforms[platform].features;
  }

  /**
   * Check if platform supports a specific feature
   */
  supportsFeature(platform: PlatformType, feature: keyof PlatformFeatures): boolean {
    return this.platforms[platform].features[feature] as boolean;
  }

  /**
   * Get all platform types
   */
  getAllPlatforms(): PlatformType[] {
    return Object.keys(this.platforms) as PlatformType[];
  }

  /**
   * Get CSS classes for platform badge
   */
  getBadgeClasses(platform: PlatformType): string {
    const classes: Record<PlatformType, string> = {
      twitch: "bg-[#9146FF] text-white",
      kick: "bg-[#53FC18] text-black",
      youtube: "bg-[#FF0000] text-white",
    };
    return classes[platform];
  }

  /**
   * Get CSS classes for platform badge in mixed filter
   */
  getMixedFilterBadgeClasses(platform: PlatformType, isEnabled: boolean): string {
    const baseClasses = this.getBadgeClasses(platform);
    return isEnabled ? baseClasses : "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400";
  }

  /**
   * Get CSS classes for connection status
   */
  getStatusClasses(status: PlatformStatus | WidgetStatus): string {
    const classes: Record<PlatformStatus | WidgetStatus, string> = {
      disconnected: "bg-slate-400",
      connecting: "bg-yellow-400",
      connected: "bg-emerald-500",
      reconnecting: "bg-orange-400",
      live: "bg-cyan-500",
      draft: "bg-slate-400",
    };
    return classes[status];
  }

  /**
   * Get label for connection status
   */
  getStatusLabel(status: PlatformStatus | WidgetStatus): string {
    const labels: Record<PlatformStatus | WidgetStatus, string> = {
      disconnected: "Disconnected",
      connecting: "Connecting",
      connected: "Connected",
      reconnecting: "Reconnecting",
      live: "Live",
      draft: "Draft",
    };
    return labels[status];
  }

  /**
   * Get default connection mode for platform
   */
  getDefaultConnectionMode(platform: PlatformType): ConnectionMode {
    const features = this.platforms[platform].features;
    if (features.requiresOAuth) {
      return "account";
    }
    return "channelWatch";
  }

  // Icon SVG generators
  private getTwitchIcon(): string {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239146FF'%3E%3Cpath d='M2.149 0l-1.612 3.76v16.482h4.841v3.76h3.227l3.227-3.76h4.303l7.53-7.53V0H2.149zm18.82 12.967l-3.227 3.227h-4.303l-2.689 3.227v-3.227H6.453V2.149h14.516v10.818zm-3.764-6.453h-2.149v6.453h2.149V6.514zm-5.915 0H9.136v6.453h2.149V6.514z'/%3E%3C/svg%3E";
  }

  private getKickIcon(): string {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2353FC18'%3E%3Cpath d='M4.5 3.75L3 24h4.5l1.5-12 3 12h4.5l4.5-20.25h-4.5l-3 13.5-3-13.5H4.5z'/%3E%3C/svg%3E";
  }

  private getYoutubeIcon(): string {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FF0000'%3E%3Cpath d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'/%3E%3C/svg%3E";
  }
}
