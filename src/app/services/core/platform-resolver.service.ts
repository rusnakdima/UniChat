/* sys lib */
import { Injectable } from "@angular/core";

/* constants */
import {
  PLATFORM_TWITCH_ICON,
  PLATFORM_KICK_ICON,
  PLATFORM_YOUTUBE_ICON,
} from "@shared/utils/constants";

/* models */
import {
  PlatformType,
  PlatformCapabilities,
  PlatformStatus,
  ConnectionMode,
  WidgetStatus,
} from "@models/chat.model";
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
    return isEnabled
      ? baseClasses
      : "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400";
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
    return PLATFORM_TWITCH_ICON;
  }

  private getKickIcon(): string {
    return PLATFORM_KICK_ICON;
  }

  private getYoutubeIcon(): string {
    return PLATFORM_YOUTUBE_ICON;
  }
}
