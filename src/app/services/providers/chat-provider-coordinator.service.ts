import { Injectable, inject } from "@angular/core";
import { PlatformType } from "@models/chat.model";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { YouTubeChatService } from "@services/providers/youtube-chat.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatChannel } from "@models/chat.model";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { ChatStateManagerService } from "@services/data/chat-state-manager.service";

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

  constructor() {
    this.twitchService.onStatusChange((channelId, status) => {
      this.connectionStateService.setChannelStatus(channelId, status);

      // Update global connection state based on status
      if (status === "connected") {
        this.chatStateManager.markChannelAsConnected(channelId);
      } else if (status === "disconnected" || status === "reconnecting") {
        this.chatStateManager.markChannelAsDisconnected(channelId);
      }
    });
  }

  connectChannel(channelId: string, platform: PlatformType): void {
    const channel = this.resolveChannel(channelId, platform);
    switch (platform) {
      case "twitch":
        this.connectionStateService.setChannelStatus(channel?.channelId ?? channelId, "connecting");
        this.twitchService.connect(channel?.channelName ?? channelId);
        break;
      case "kick":
        this.kickService.connect(channel?.channelId ?? channelId);
        // Mark as connected immediately for kick/youtube (no status callbacks)
        this.chatStateManager.markChannelAsConnected(channel?.channelId ?? channelId);
        break;
      case "youtube":
        this.youtubeService.connect(channel?.channelId ?? channelId);
        // Mark as connected immediately for kick/youtube (no status callbacks)
        this.chatStateManager.markChannelAsConnected(channel?.channelId ?? channelId);
        break;
    }
  }

  disconnectChannel(channelId: string, platform: PlatformType): void {
    const channel = this.resolveChannel(channelId, platform);
    switch (platform) {
      case "twitch":
        this.twitchService.disconnect(channel?.channelName ?? channelId);
        this.connectionStateService.setChannelStatus(
          channel?.channelId ?? channelId,
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
    this.chatStateManager.markChannelAsDisconnected(channel?.channelId ?? channelId);
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
      this.connectChannel(channel.channelId, channel.platform);
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
        return this.kickService.sendMessage(channel?.channelId ?? channelId, text);
      }
      case "youtube": {
        const channel = this.resolveChannel(channelId, platform);
        return this.youtubeService.sendMessage(channel?.channelId ?? channelId, text);
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
    switch (platform) {
      case "youtube": {
        const channel = this.resolveChannel(channelId, platform);
        return this.youtubeService.deleteMessage(channel?.channelId ?? channelId, messageId);
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
