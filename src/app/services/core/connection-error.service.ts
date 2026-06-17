/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { PlatformType, ChannelConnectionError } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { generateTimestamp } from "@shared/utils/chat.helper";
import {
  ConnectionErrorCode,
  ConnectionErrorCodeType,
  USER_FRIENDLY_MESSAGES,
  PLATFORM_NAMES,
  UserFriendlyMessage,
} from "./connection-error.messages";

export { ConnectionErrorCode } from "./connection-error.messages";
export type { ConnectionErrorCodeType } from "./connection-error.messages";

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

  getUserFriendlyMessage(
    code: ConnectionErrorCodeType,
    platform?: PlatformType,
    channelName?: string
  ): UserFriendlyMessage {
    const baseMessage = USER_FRIENDLY_MESSAGES[code];
    const platformName = platform ? PLATFORM_NAMES[platform] : "the platform";
    const context = channelName ? `"${channelName}"` : "the channel";

    return {
      title: baseMessage.title,
      message: baseMessage.message
        .replace("the platform", platformName)
        .replace("This channel", context)
        .replace("the connection", `${platformName} connection`),
      action: baseMessage.action,
    };
  }

  reportError(channelId: string, error: Omit<ChannelConnectionError, "occurredAt">): void {
    this.connectionStateService.reportError(channelId, {
      ...error,
      occurredAt: generateTimestamp(),
    });
  }

  clearError(channelId: string): void {
    this.connectionStateService.clearError(channelId);
  }

  reportTokenExpired(channelId: string): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.AUTH_TOKEN_EXPIRED,
      message: USER_FRIENDLY_MESSAGES[ConnectionErrorCode.AUTH_TOKEN_EXPIRED].message,
      isRecoverable: false,
    });
  }

  reportAuthFailed(channelId: string): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.AUTH_FAILED,
      message: USER_FRIENDLY_MESSAGES[ConnectionErrorCode.AUTH_FAILED].message,
      isRecoverable: false,
    });
  }

  reportAuthCredentialsMissing(platform: PlatformType): void {
    this.reportError(platform, {
      code: ConnectionErrorCode.AUTH_CREDENTIALS_MISSING,
      message: USER_FRIENDLY_MESSAGES[ConnectionErrorCode.AUTH_CREDENTIALS_MISSING].message,
      isRecoverable: false,
    });
  }

  reportNetworkTimeout(channelId: string, platform: PlatformType): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.NETWORK_TIMEOUT,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.NETWORK_TIMEOUT, platform).message,
      isRecoverable: true,
    });
  }

  reportWebSocketError(channelId: string, platform: PlatformType, isRecoverable = true): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.WEBSOCKET_ERROR,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.WEBSOCKET_ERROR, platform).message,
      isRecoverable,
    });
  }

  reportRateLimited(channelId: string, platform: PlatformType): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.PLATFORM_RATE_LIMITED,
      message: this.getUserFriendlyMessage(ConnectionErrorCode.PLATFORM_RATE_LIMITED, platform)
        .message,
      isRecoverable: true,
    });
  }

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

  reportNetworkError(channelId: string, message: string, isRecoverable = true): void {
    this.reportError(channelId, {
      code: ConnectionErrorCode.NETWORK_UNREACHABLE,
      message,
      isRecoverable,
    });
  }

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
