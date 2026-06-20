import { Injectable, inject, signal } from "@angular/core";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { YouTubeChatService } from "@services/providers/youtube-chat.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatMessage, PlatformType } from "@entities/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";

export interface ChatState {
  isConnected: boolean;
  currentChannel: string | null;
  highlightedMessageId: string | null;
}

@Injectable({ providedIn: "root" })
export class ChatStateService {
  private readonly twitch = inject(TwitchChatService);
  private readonly kick = inject(KickChatService);
  private readonly youtube = inject(YouTubeChatService);
  private readonly storage = inject(UnifiedStorageService);
  private readonly feed = inject(DashboardFeedDataService);

  private outgoingCounter = 0;

  private _state = signal<ChatState>({
    isConnected: false,
    currentChannel: null,
    highlightedMessageId: null,
  });
  readonly state = this._state.asReadonly();

  highlightedMessageId(): string | null {
    return this._state().highlightedMessageId;
  }
  highlightMessage(messageId: string): void {
    this.setHighlightedMessage(messageId);
  }
  getState(): ChatState {
    return this._state();
  }
  setChannel(channelRef: string): void {
    this._state.update((s) => ({ ...s, currentChannel: channelRef }));
  }
  setHighlightedMessage(messageId: string | null): void {
    this._state.update((s) => ({ ...s, highlightedMessageId: messageId }));
  }

  sendOutgoingChatMessage(text: string, platform?: string, channelId?: string): void {
    if (platform && channelId) {
      this.addOutgoingMessage(text, platform as PlatformType, channelId);
    }

    if (platform === "twitch") {
      this.twitch
        .sendMessage(text, channelId)
        .catch((e) => console.error("[ChatState] Failed to send via Twitch:", e));
    } else if (platform === "kick") {
      this.kick
        .sendMessage(text)
        .catch((e) => console.error("[ChatState] Failed to send via Kick:", e));
    } else if (platform === "youtube") {
      this.youtube.sendMessage(text);
    } else {
      this.twitch
        .sendMessage(text)
        .catch((e) => console.error("[ChatState] Failed to send via Twitch:", e));
      this.kick
        .sendMessage(text)
        .catch((e) => console.error("[ChatState] Failed to send via Kick:", e));
      this.youtube.sendMessage(text);
    }
  }

  addOutgoingMessage(text: string, platform: PlatformType, channelId: string): ChatMessage {
    this.outgoingCounter++;
    const id = `outgoing-${platform}-${channelId}-${Date.now()}-${this.outgoingCounter}`;
    const storageKey = buildChannelRef(platform, channelId);

    const message: ChatMessage = {
      id,
      platform,
      sourceMessageId: id,
      sourceChannelId: channelId,
      sourceUserId: "",
      author: "You",
      text,
      timestamp: new Date().toISOString(),
      badges: [],
      isSupporter: false,
      isOutgoing: true,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { kind: "reply", status: "disabled" },
        delete: { kind: "delete", status: "disabled" },
      },
      rawPayload: {
        providerEvent: "outgoing",
        providerChannelId: channelId,
        providerUserId: "",
        preview: text.slice(0, 100),
      },
      receivedAt: Date.now(),
    };

    this.storage.addMessage(storageKey, message);
    this.feed.addMessage(message);
    return message;
  }
}
