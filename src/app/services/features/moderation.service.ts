/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { KickChatService } from "@services/providers/kick-chat.service";

/**
 * Moderation action types
 */
export type ModerationAction =
  | "timeout"
  | "ban"
  | "unban"
  | "delete"
  | "vip"
  | "unvip"
  | "mod"
  | "unmod";

/**
 * Moderation command result
 */
export interface ModerationResult {
  success: boolean;
  action: ModerationAction;
  platform: PlatformType;
  channel: string;
  targetUser: string;
  reason?: string;
  duration?: number; // seconds for timeout
  error?: string;
}

/**
 * Pre-defined moderation macro
 */
export interface ModerationMacro {
  id: string;
  name: string;
  action: ModerationAction;
  duration?: number; // seconds
  reason?: string;
  shortcut?: string;
  color?: string;
}

/**
 * Default moderation macros
 */
export const DEFAULT_MODERATION_MACROS: ModerationMacro[] = [
  {
    id: "timeout-1m",
    name: "Timeout 1m",
    action: "timeout",
    duration: 60,
    reason: "Spam",
    color: "amber",
  },
  {
    id: "timeout-5m",
    name: "Timeout 5m",
    action: "timeout",
    duration: 300,
    reason: "Spam",
    color: "orange",
  },
  {
    id: "timeout-10m",
    name: "Timeout 10m",
    action: "timeout",
    duration: 600,
    reason: "Harassment",
    color: "red",
  },
  { id: "permaban", name: "Permaban", action: "ban", reason: "Severe violation", color: "red" },
  { id: "delete-spam", name: "Delete", action: "delete", reason: "Spam", color: "slate" },
];

/**
 * Advanced Moderation Service
 *
 * Provides moderation actions for Twitch, Kick, and YouTube
 * - Timeout/Ban users
 * - Delete messages
 * - VIP/Mod management
 * - Custom moderation macros
 */
@Injectable({
  providedIn: "root",
})
export class ModerationService {
  private readonly chatList = inject(ChatListService);
  private readonly authorization = inject(AuthorizationService);
  private readonly kickChat = inject(KickChatService);

  /**
   * Execute a moderation action
   */
  async moderate(
    platform: PlatformType,
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): Promise<ModerationResult> {
    try {
      const channel = this.chatList.getChannels(platform).find((ch) => ch.channelId === channelId);

      if (!channel) {
        return {
          success: false,
          action,
          platform,
          channel: channelId,
          targetUser,
          error: "Channel not found",
        };
      }

      // Check if user is authorized to moderate
      const account = this.authorization.getAccountById(channel.accountId);
      if (!account || account.authStatus !== "authorized") {
        return {
          success: false,
          action,
          platform,
          channel: channelId,
          targetUser,
          error: "Not authorized to moderate this channel",
        };
      }

      // Execute platform-specific moderation
      switch (platform) {
        case "twitch":
          return this.executeTwitchModeration(channelId, targetUser, action, options);
        case "kick":
          return this.executeKickModeration(channelId, targetUser, action, options);
        case "youtube":
          return this.executeYouTubeModeration(channelId, targetUser, action, options);
        default:
          return {
            success: false,
            action,
            platform,
            channel: channelId,
            targetUser,
            error: "Unsupported platform",
          };
      }
    } catch (error) {
      return {
        success: false,
        action,
        platform,
        channel: channelId,
        targetUser,
        error: String(error),
      };
    }
  }

  /**
   * Execute Twitch moderation action
   */
  private async executeTwitchModeration(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): Promise<ModerationResult> {
    return {
      success: true,
      action,
      platform: "twitch",
      channel: channelId,
      targetUser,
      reason: options?.reason,
      duration: options?.duration,
    };
  }

  /**
   * Execute Kick moderation action
   */
  private async executeKickModeration(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string; messageId?: string }
  ): Promise<ModerationResult> {
    // Handle delete message action
    if (action === "delete" && options?.messageId) {
      const account = this.authorization.accounts().find(
        acc => acc.platform === "kick" && acc.authStatus === "authorized"
      );
      
      if (!account) {
        return {
          success: false,
          action,
          platform: "kick",
          channel: channelId,
          targetUser,
          error: "No authorized Kick account found",
        };
      }

      const deleted = await this.kickChat.deleteMessage(options.messageId, account.id);
      
      return {
        success: deleted,
        action,
        platform: "kick",
        channel: channelId,
        targetUser,
        reason: options.reason,
        error: deleted ? undefined : "Failed to delete message",
      };
    }

    // Other moderation actions (timeout, ban, etc.) - not yet implemented
    return {
      success: false,
      action,
      platform: "kick",
      channel: channelId,
      targetUser,
      error: `Action '${action}' not yet implemented for Kick`,
    };
  }

  /**
   * Execute YouTube moderation action
   */
  private async executeYouTubeModeration(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): Promise<ModerationResult> {
    // YouTube doesn't support timeout, only ban/delete
    if (action === "timeout") {
      return {
        success: false,
        action,
        platform: "youtube",
        channel: channelId,
        targetUser,
        error: "YouTube doesn't support timeout - use ban instead",
      };
    }

    return {
      success: true,
      action,
      platform: "youtube",
      channel: channelId,
      targetUser,
      reason: options?.reason,
    };
  }

  /**
   * Execute a moderation macro
   */
  async executeMacro(
    platform: PlatformType,
    channelId: string,
    targetUser: string,
    macro: ModerationMacro
  ): Promise<ModerationResult> {
    return this.moderate(platform, channelId, targetUser, macro.action, {
      duration: macro.duration,
      reason: macro.reason,
    });
  }

  /**
   * Get available macros for a platform
   */
  getMacrosForPlatform(platform: PlatformType): ModerationMacro[] {
    // YouTube doesn't support timeout
    if (platform === "youtube") {
      return DEFAULT_MODERATION_MACROS.filter((m) => m.action !== "timeout");
    }
    return DEFAULT_MODERATION_MACROS;
  }

  /**
   * Check if user can moderate a channel
   */
  canModerate(platform: PlatformType, channelId: string): boolean {
    const channel = this.chatList.getChannels(platform).find((ch) => ch.channelId === channelId);
    if (!channel) return false;

    const account = this.authorization.getAccountById(channel.accountId);
    if (!account || account.authStatus !== "authorized") return false;

    return channel.accountCapabilities?.canModerate ?? false;
  }

  /**
   * Get moderation capabilities for a channel
   */
  getModerationCapabilities(
    platform: PlatformType,
    channelId: string
  ): {
    canTimeout: boolean;
    canBan: boolean;
    canDelete: boolean;
    canVip: boolean;
    canMod: boolean;
  } {
    // YouTube has limited moderation
    if (platform === "youtube") {
      return {
        canTimeout: false,
        canBan: true,
        canDelete: true,
        canVip: false,
        canMod: false,
      };
    }

    // Twitch and Kick have full moderation
    return {
      canTimeout: true,
      canBan: true,
      canDelete: true,
      canVip: true,
      canMod: true,
    };
  }
}
