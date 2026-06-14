import { inject } from "@angular/core";
import { PlatformType } from "@models/chat.model";
import { ModerationAction, ModerationResult } from "./moderation.service";

export class PlatformModerationHandler {
  private readonly platform: PlatformType;

  constructor(platform: PlatformType) {
    this.platform = platform;
  }

  execute(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): ModerationResult {
    switch (this.platform) {
      case "twitch":
        return this.executeTwitch(channelId, targetUser, action, options);
      case "kick":
        return this.executeKick(channelId, targetUser, action, options);
      case "youtube":
        return this.executeYoutube(channelId, targetUser, action, options);
      default:
        return this.unsupported(channelId, targetUser, action);
    }
  }

  private executeTwitch(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): ModerationResult {
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

  private executeKick(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): ModerationResult {
    return {
      success: false,
      action,
      platform: "kick",
      channel: channelId,
      targetUser,
      error: `Action '${action}' not yet implemented for Kick`,
    };
  }

  private executeYoutube(
    channelId: string,
    targetUser: string,
    action: ModerationAction,
    options?: { duration?: number; reason?: string }
  ): ModerationResult {
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

  private unsupported(
    channelId: string,
    targetUser: string,
    action: ModerationAction
  ): ModerationResult {
    return {
      success: false,
      action,
      platform: this.platform,
      channel: channelId,
      targetUser,
      error: "Unsupported platform",
    };
  }

  getCapabilities(): {
    canTimeout: boolean;
    canBan: boolean;
    canDelete: boolean;
    canVip: boolean;
    canMod: boolean;
  } {
    if (this.platform === "youtube") {
      return {
        canTimeout: false,
        canBan: true,
        canDelete: true,
        canVip: false,
        canMod: false,
      };
    }

    return {
      canTimeout: true,
      canBan: true,
      canDelete: true,
      canVip: true,
      canMod: true,
    };
  }
}
