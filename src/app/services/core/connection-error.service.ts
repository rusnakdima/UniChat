/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { PlatformType, ChannelConnectionError } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
/**
 * Error codes for connection errors
 */
export const ConnectionErrorCode = {
  // Authentication errors
  AUTH_TOKEN_EXPIRED: "auth_token_expired",
  AUTH_TOKEN_INVALID: "auth_token_invalid",
  AUTH_SCOPE_MISSING: "auth_scope_missing",
  AUTH_FAILED: "auth_failed",

  // Network errors
  NETWORK_OFFLINE: "network_offline",
  NETWORK_TIMEOUT: "network_timeout",
  NETWORK_UNREACHABLE: "network_unreachable",
  WEBSOCKET_CLOSED: "websocket_closed",
  WEBSOCKET_ERROR: "websocket_error",

  // Platform-specific errors
  PLATFORM_RATE_LIMITED: "platform_rate_limited",
  PLATFORM_UNAVAILABLE: "platform_unavailable",
  CHANNEL_NOT_FOUND: "channel_not_found",
  CHANNEL_BANNED: "channel_banned",

  // Generic errors
  UNKNOWN: "unknown",
  INTERNAL_ERROR: "internal_error",
} as const;

export type ConnectionErrorCodeType =
  (typeof ConnectionErrorCode)[keyof typeof ConnectionErrorCode];

/**
 * User-friendly error messages mapped by error code and platform
 */
const USER_FRIENDLY_MESSAGES: Record<
  ConnectionErrorCodeType,
  {
    title: string;
    message: string;
    action: string;
  }
> = {
  // Authentication errors
  [ConnectionErrorCode.AUTH_TOKEN_EXPIRED]: {
    title: "Authentication Expired",
    message: "Your connection has expired. Please reconnect your account.",
    action: "Reconnect in Settings",
  },
  [ConnectionErrorCode.AUTH_TOKEN_INVALID]: {
    title: "Invalid Authentication",
    message: "Your authentication token is no longer valid.",
    action: "Reconnect in Settings",
  },
  [ConnectionErrorCode.AUTH_SCOPE_MISSING]: {
    title: "Missing Permissions",
    message: "Required permissions are missing from your account.",
    action: "Reconnect with Full Permissions",
  },
  [ConnectionErrorCode.AUTH_FAILED]: {
    title: "Authentication Failed",
    message: "Unable to authenticate with the platform.",
    action: "Check Credentials and Reconnect",
  },

  // Network errors
  [ConnectionErrorCode.NETWORK_OFFLINE]: {
    title: "No Internet Connection",
    message: "Checking your internet connection...",
    action: "Check Network Settings",
  },
  [ConnectionErrorCode.NETWORK_TIMEOUT]: {
    title: "Connection Timeout",
    message: "The connection took too long to respond. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.NETWORK_UNREACHABLE]: {
    title: "Network Unreachable",
    message: "Unable to reach the platform. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.WEBSOCKET_CLOSED]: {
    title: "Connection Closed",
    message: "The chat connection was closed unexpectedly.",
    action: "Reconnecting...",
  },
  [ConnectionErrorCode.WEBSOCKET_ERROR]: {
    title: "Connection Error",
    message: "A connection error occurred. Attempting to reconnect...",
    action: "Reconnecting...",
  },

  // Platform-specific errors
  [ConnectionErrorCode.PLATFORM_RATE_LIMITED]: {
    title: "Rate Limited",
    message: "Too many requests. Waiting before retry...",
    action: "Waiting to Retry",
  },
  [ConnectionErrorCode.PLATFORM_UNAVAILABLE]: {
    title: "Platform Unavailable",
    message: "The platform is temporarily unavailable. Please try again later.",
    action: "Try Again Later",
  },
  [ConnectionErrorCode.CHANNEL_NOT_FOUND]: {
    title: "Channel Not Found",
    message: "This channel doesn't exist or has been deleted.",
    action: "Verify Channel Name",
  },
  [ConnectionErrorCode.CHANNEL_BANNED]: {
    title: "Channel Suspended",
    message: "This channel has been suspended or banned.",
    action: "Contact Support",
  },

  // Generic errors
  [ConnectionErrorCode.UNKNOWN]: {
    title: "Connection Issue",
    message: "An unexpected error occurred. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.INTERNAL_ERROR]: {
    title: "Internal Error",
    message: "An internal error occurred. Please try restarting the application.",
    action: "Restart Application",
  },
};

/**
 * Platform-specific error message enhancements
 */
const PLATFORM_NAMES: Record<PlatformType, string> = {
  twitch: "Twitch",
  kick: "Kick",
  youtube: "YouTube",
};

/**
 * Connection Error Service - Centralized Error Handling
 *
 * Responsibility: Provides centralized error reporting and categorization
 * for connection-related errors across all platform providers.
 *
 * Usage:
 * ```typescript
 * // In a provider service:
 * this.errorService.reportError(channelId, {
 *   code: ConnectionErrorCode.NETWORK_TIMEOUT,
 *   message: 'Connection timed out',
 *   isRecoverable: true,
 * });
 * ```
 */
@Injectable({
  providedIn: "root",
})
export class ConnectionErrorService {
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly chatListService = inject(ChatListService);

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(
    code: ConnectionErrorCodeType,
    platform?: PlatformType,
    channelName?: string
  ): { title: string; message: string; action: string } {
    const baseMessage = USER_FRIENDLY_MESSAGES[code];
    const platformName = platform ? PLATFORM_NAMES[platform] : "the platform";
    const context = channelName ? `"${channelName}"` : "the channel";

    // Customize message based on platform and channel context
    return {
      title: baseMessage.title,
      message: baseMessage.message
        .replace("the platform", platformName)
        .replace("This channel", context)
        .replace("the connection", `${platformName} connection`),
      action: baseMessage.action,
    };
  }

  /**
   * Report a connection error for a channel
   */
  reportError(channelId: string, error: Omit<ChannelConnectionError, "occurredAt">): void {
    this.connectionStateService.reportError(channelId, {
      ...error,
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Clear error for a channel
   */
  clearError(channelId: string): void {
    this.connectionStateService.clearError(channelId);
  }

  /**
   * Report authentication token expired error
   */
  reportTokenExpired(channelId: string): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.AUTH_TOKEN_EXPIRED,
      message: USER_FRIENDLY_MESSAGES[ConnectionErrorCode.AUTH_TOKEN_EXPIRED].message,
      isRecoverable: false,
    });
  }

  /**
   * Report authentication failed error
   */
  reportAuthFailed(channelId: string): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.AUTH_FAILED,
      message: USER_FRIENDLY_MESSAGES[ConnectionErrorCode.AUTH_FAILED].message,
      isRecoverable: false,
    });
  }

  /**
   * Report network timeout error
   */
  reportNetworkTimeout(channelId: string, platform: PlatformType): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.NETWORK_TIMEOUT,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.NETWORK_TIMEOUT, platform).message,
      isRecoverable: true,
    });
  }

  /**
   * Report WebSocket connection error
   */
  reportWebSocketError(channelId: string, platform: PlatformType, isRecoverable = true): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.WEBSOCKET_ERROR,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.WEBSOCKET_ERROR, platform).message,
      isRecoverable,
    });
  }

  /**
   * Report rate limit error
   */
  reportRateLimited(channelId: string, platform: PlatformType): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.PLATFORM_RATE_LIMITED,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.PLATFORM_RATE_LIMITED, platform)
        .message,
      isRecoverable: true,
    });
  }

  /**
   * Report channel not found error
   */
  reportChannelNotFound(channelId: string, platform: PlatformType, channelName?: string): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.CHANNEL_NOT_FOUND,
      message: this.getUserFriendlyMessage(
        ConnectionErrorCode.CHANNEL_NOT_FOUND,
        platform,
        channelName
      ).message,
      isRecoverable: false,
    });
  }

  /**
   * Report generic network error
   */
  reportNetworkError(channelId: string, message: string, isRecoverable = true): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.NETWORK_UNREACHABLE,
      message,
      isRecoverable,
    });
  }

  /**
   * Handle error from a Promise (convenience method)
   */
  handlePromiseError<T>(
    promise: Promise<T>,
    channelId: string,
    errorAction: (error: unknown) => Omit<ChannelConnectionError, "occurredAt">
  ): Promise<T | null> {
    return promise.catch((error) => {
      this.reportError(channelId, errorAction(error));
      return null;
    });
  }
}
