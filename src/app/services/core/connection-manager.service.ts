import { Injectable, inject, effect } from "@angular/core";
import { ChatListService } from "@services/data/chat-list.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { YouTubeChatService } from "@services/providers/youtube-chat.service";
import { buildChannelRef } from "@utils/channel-ref.util";

@Injectable({ providedIn: "root" })
export class ConnectionManagerService {
  private readonly chatList = inject(ChatListService);
  private readonly twitch = inject(TwitchChatService);
  private readonly kick = inject(KickChatService);
  private readonly youtube = inject(YouTubeChatService);

  private previousConnections = new Map<string, { platform: string; channelId: string }>();

  constructor() {
    effect(() => {
      const channels = this.chatList.channels();
      const visible = channels.filter((ch) => ch.isVisible);
      const current = new Map<string, { platform: string; channelId: string }>();

      for (const ch of visible) {
        const ref = buildChannelRef(ch.platform, ch.channelId);
        current.set(ref, { platform: ch.platform, channelId: ch.channelId });
      }

      for (const [ref, info] of current) {
        if (!this.previousConnections.has(ref)) {
          this.connect(info.platform, info.channelId);
        }
      }

      for (const [ref, info] of this.previousConnections) {
        if (!current.has(ref)) {
          this.disconnect(info.platform, info.channelId);
        }
      }

      this.previousConnections = current;
    });
  }

  private connect(platform: string, channelId: string): void {
    switch (platform) {
      case "twitch":
        this.twitch
          .connect(channelId)
          .catch((e) =>
            console.error(`[ConnectionManager] Failed to connect Twitch ${channelId}:`, e)
          );
        break;
      case "kick":
        this.kick
          .connect(channelId)
          .catch((e) =>
            console.error(`[ConnectionManager] Failed to connect Kick ${channelId}:`, e)
          );
        break;
      case "youtube":
        this.youtube
          .connect(channelId)
          .catch((e) =>
            console.error(`[ConnectionManager] Failed to connect YouTube ${channelId}:`, e)
          );
        break;
    }
  }

  private disconnect(platform: string, channelId: string): void {
    switch (platform) {
      case "twitch":
        this.twitch.disconnectChannel(channelId);
        break;
      case "kick":
        this.kick.disconnectChannel(channelId);
        break;
      case "youtube":
        this.youtube.disconnectChannel(channelId);
        break;
    }
  }
}
