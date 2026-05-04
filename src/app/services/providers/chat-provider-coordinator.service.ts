/* sys lib */
import { DestroyRef, inject, Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/* models */
import { ChatChannel, PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateManagerService } from "@services/data/chat-state-manager.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { YouTubeChatService } from "@services/providers/youtube-chat.service";
import { buildChannelRef } from "@utils/channel-ref.util";
@Injectable({
  providedIn: "root",
})
export class ChatProviderCoordinatorService {
  private readonly twitchService = inject(TwitchChatService);
  private readonly kickService = inject(KickChatService);
  private readonly youtubeService = inject(YouTubeChatService);
  private readonly chatListService = inject(ChatListService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly chatStateManager = inject(ChatStateManagerService);
  private readonly authService = inject(AuthorizationService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.twitchService.onStatusChange((channelId, status) => {
      const channelRef = buildChannelRef("twitch", channelId);
      this.connectionStateService.setChannelStatus(channelRef, status);

      // Update global connection state based on status
      if (status === "connected") {
        this.chatStateManager.markChannelAsConnected(channelRef);
      } else if (status === "disconnected" || status === "reconnecting") {
        this.chatStateManager.markChannelAsDisconnected(channelRef);
      }
    });

    // Listen for token refresh events and reconnect affected channels
    this.authService.tokenRefreshed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ accountId, platform }) => {
        this.reconnectChannelsForAccount(accountId, platform);
      });
  }

  connectChannel(channelId: string, platform: PlatformType): void {
    const channel = this.resolveChannel(channelId, platform);
    switch (platform) {
      case "twitch":
        this.connectionStateService.setChannelStatus(
          buildChannelRef(platform, channel?.channelId ?? channelId),
          "connecting"
        );
        this.twitchService.connect(channel?.channelName ?? channelId);
        break;
      case "kick":
        this.kickService.connect(channel?.channelId ?? channelId);
        this.chatStateManager.markChannelAsConnected(
          buildChannelRef(platform, channel?.channelId ?? channelId)
        );
        break;
      case "youtube":
        this.youtubeService.connect(channel?.channelId ?? channelId);
        this.chatStateManager.markChannelAsConnected(
          buildChannelRef(platform, channel?.channelId ?? channelId)
        );
        break;
    }
  }

  disconnectChannel(channelId: string, platform: PlatformType): void {
    const channel = this.resolveChannel(channelId, platform);
    switch (platform) {
      case "twitch":
        this.twitchService.disconnect(channel?.channelName ?? channelId);
        this.connectionStateService.setChannelStatus(
          buildChannelRef(platform, channel?.channelId ?? channelId),
          "disconnected"
        );
        break;
      case "kick":
        this.kickService.disconnect(channel?.channelId ?? channelId);
        break;
      case "youtube":
        this.youtubeService.disconnect(channel?.channelId ?? channelId);
        break;
    }

    // Update global state on disconnect
    this.chatStateManager.markChannelAsDisconnected(
      buildChannelRef(platform, channel?.channelId ?? channelId)
    );
  }

  /**
   * Reconnect a single channel with fresh credentials
   */
  reconnectChannel(channelId: string, platform: PlatformType): void {
    const channel = this.resolveChannel(channelId, platform);
    const resolvedChannelId = channel?.channelId ?? channelId;
    const channelRef = buildChannelRef(platform, resolvedChannelId);

    switch (platform) {
      case "twitch":
        this.connectionStateService.setChannelStatus(channelRef, "reconnecting");
        this.twitchService.reconnectChannel(channel?.channelName ?? channelId);
        break;
      case "kick":
        this.kickService.reconnectChannel(resolvedChannelId);
        break;
      case "youtube":
        this.youtubeService.reconnectChannel(resolvedChannelId);
        break;
    }
  }

  /**
   * Reconnect all channels linked to a specific account
   * Called after token refresh to restore all connections for that account
   */
  reconnectChannelsForAccount(accountId: string, platform: PlatformType): void {
    const channels = this.chatListService.getChannels(platform);
    const accountChannels = channels.filter((ch) => ch.accountId === accountId);

    if (accountChannels.length === 0) {
      return;
    }

    for (const channel of accountChannels) {
      try {
        this.reconnectChannel(channel.channelId, platform);
      } catch {
        // Isolate failures
      }
    }
  }

  isConnected(channelId: string, platform: PlatformType): boolean {
    switch (platform) {
      case "twitch":
        return this.twitchService.isConnected(channelId);
      case "kick":
        return this.kickService.isConnected(channelId);
      case "youtube":
        return this.youtubeService.isConnected(channelId);
      default:
        return false;
    }
  }

  connectAllVisibleChannels(): void {
    const channels = this.chatListService.getVisibleChannels();

    for (const channel of channels) {
      try {
        this.connectChannel(channel.channelId, channel.platform);
      } catch {
        /* Isolate failures: one broken channel or platform must not block the rest */
      }
    }
  }

  disconnectAll(): void {
    const channels = this.chatListService.getVisibleChannels();

    for (const channel of channels) {
      this.disconnectChannel(channel.channelId, channel.platform);
    }
  }

  async sendMessage(channelId: string, platform: PlatformType, text: string): Promise<boolean> {
    if (!text.trim()) {
      return false;
    }

    switch (platform) {
      case "twitch": {
        const channel = this.resolveChannel(channelId, platform);
        return this.twitchService.sendMessageAsync(channel?.channelName ?? channelId, text);
      }
      case "kick": {
        const channel = this.resolveChannel(channelId, platform);
        return this.kickService.sendMessage(
          channel?.channelId ?? channelId,
          text,
          channel?.accountId
        );
      }
      case "youtube": {
        const channel = this.resolveChannel(channelId, platform);
        return this.youtubeService.sendMessage(
          channel?.channelId ?? channelId,
          text,
          channel?.accountId
        );
      }
      default:
        return false;
    }
  }

  async deleteMessage(
    channelId: string,
    platform: PlatformType,
    messageId: string
  ): Promise<boolean> {
    const channel = this.resolveChannel(channelId, platform);

    switch (platform) {
      case "twitch":
        return this.twitchService.deleteMessageAsync(channel?.channelName ?? channelId, messageId);
      case "kick": {
        const channel = this.resolveChannel(channelId, platform);
        return this.kickService.deleteMessage(messageId, channel?.accountId);
      }
      case "youtube": {
        const channel = this.resolveChannel(channelId, platform);
        return this.youtubeService.deleteMessage(
          channel?.channelId ?? channelId,
          messageId,
          channel?.accountId
        );
      }
      default:
        return false;
    }
  }

  private resolveChannel(channelId: string, platform: PlatformType): ChatChannel | undefined {
    return this.chatListService
      .getChannels(platform)
      .find((channel) => channel.channelId === channelId);
  }
}
