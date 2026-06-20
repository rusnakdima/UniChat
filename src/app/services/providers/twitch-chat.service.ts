import { Injectable, inject, OnDestroy } from "@angular/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TauriApiService } from "@app/api/api.api.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatMessage, ChatMessageEmote } from "@entities/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";

interface TwitchIrcMessage {
  id: string;
  platform: string;
  channelId: string;
  channelName: string;
  author: string;
  authorId: string;
  text: string;
  timestamp: number;
  badges: { setId: string; id: string; version: string }[];
  color: string;
  emotes: { id: string; code: string; urls: string[] }[];
  isMod: boolean;
  isSubscriber: boolean;
  isHighlighted: boolean;
}

@Injectable({ providedIn: "root" })
export class TwitchChatService implements OnDestroy {
  private readonly api = inject(TauriApiService);
  private readonly auth = inject(AuthorizationService);
  private readonly storage = inject(UnifiedStorageService);
  private readonly feed = inject(DashboardFeedDataService);

  private activeConnections = new Map<string, string>();
  private unlisten: UnlistenFn | null = null;
  private seenMessageIds = new Set<string>();

  get connectedChannels(): string[] {
    return Array.from(this.activeConnections.keys());
  }

  async connect(channelName: string): Promise<void> {
    const account = this.auth.getPrimaryAccount("twitch");
    if (!account?.accessToken) {
      console.warn("[TwitchChat] No authorized Twitch account found");
      return;
    }

    const channelId = channelName.toLowerCase();
    const key = `${channelId}`;

    if (this.activeConnections.has(key)) {
      console.log(`[TwitchChat] Already connected to ${channelName}`);
      return;
    }

    try {
      await this.api.twitchIrcJoinChannel({
        channelId,
        channelName,
        username: account.username,
        oauthToken: account.accessToken,
      });
      this.activeConnections.set(key, channelId);
      console.log(`[TwitchChat] Connected to ${channelName}`);

      if (!this.unlisten) {
        this.unlisten = await listen<TwitchIrcMessage>("twitch-message", (event) => {
          this.handleIncomingMessage(event.payload);
        });
      }
    } catch (error) {
      console.error(`[TwitchChat] Failed to connect to ${channelName}:`, error);
    }
  }

  async disconnect(): Promise<void> {
    for (const [key] of this.activeConnections) {
      try {
        await this.api.twitchIrcLeaveChannel({
          channelId: key,
          channelName: key,
        });
      } catch (error) {
        console.error(`[TwitchChat] Error disconnecting ${key}:`, error);
      }
    }
    this.activeConnections.clear();

    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    console.log("[TwitchChat] Disconnected all channels");
  }

  async disconnectChannel(channelName: string): Promise<void> {
    const key = channelName.toLowerCase();
    if (!this.activeConnections.has(key)) return;

    try {
      await this.api.twitchIrcLeaveChannel({ channelId: key, channelName });
      this.activeConnections.delete(key);
      console.log(`[TwitchChat] Disconnected from ${channelName}`);
    } catch (error) {
      console.error(`[TwitchChat] Error disconnecting ${channelName}:`, error);
    }
  }

  isConnected(channelName: string): boolean {
    return this.activeConnections.has(channelName.toLowerCase());
  }

  async sendMessage(text: string, targetChannelName?: string): Promise<void> {
    if (targetChannelName) {
      const key = targetChannelName.toLowerCase();
      if (!this.activeConnections.has(key)) {
        console.warn(`[TwitchChat] Not connected to ${targetChannelName}`);
        return;
      }
      try {
        await this.api.twitchIrcSendMessage({
          channelId: key,
          channelName: key,
          message: text,
        });
      } catch (error) {
        console.error(`[TwitchChat] Error sending message to ${targetChannelName}:`, error);
      }
      return;
    }

    for (const [channelId] of this.activeConnections) {
      try {
        await this.api.twitchIrcSendMessage({
          channelId,
          channelName: channelId,
          message: text,
        });
      } catch (error) {
        console.error(`[TwitchChat] Error sending message to ${channelId}:`, error);
      }
    }
  }

  private handleIncomingMessage(msg: TwitchIrcMessage): void {
    console.log(`[TwitchChat] Received message:`, msg);

    if (this.seenMessageIds.has(msg.id)) {
      console.log(`[TwitchChat] Skipping duplicate message ${msg.id}`);
      return;
    }
    this.seenMessageIds.add(msg.id);

    const emotes: ChatMessageEmote[] = (msg.emotes || []).map((e) => ({
      provider: "twitch" as const,
      id: e.id,
      code: e.code,
      start: 0,
      end: 0,
      url: e.urls?.[0] || "",
    }));

    const message: ChatMessage = {
      id: msg.id,
      platform: "twitch",
      sourceMessageId: msg.id,
      sourceChannelId: msg.channelId,
      sourceUserId: msg.authorId || "",
      author: msg.author,
      text: msg.text,
      timestamp: new Date(msg.timestamp).toISOString(),
      badges: msg.badges.map((b) => `${b.setId}/${b.id}`),
      isSupporter: msg.isSubscriber,
      isOutgoing: false,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { kind: "reply", status: "available" },
        delete: { kind: "delete", status: msg.isMod ? "available" : "disabled" },
      },
      rawPayload: {
        providerEvent: "twitch-message",
        providerChannelId: msg.channelId,
        providerUserId: msg.authorId,
        preview: msg.text.slice(0, 100),
        emotes: emotes.length > 0 ? emotes : undefined,
        msgId: msg.id,
      },
      authorAvatarUrl: undefined,
      messageType: msg.isHighlighted ? "highlighted" : "regular",
      receivedAt: Date.now(),
    };

    console.log(
      `[TwitchChat] Adding message ${message.id} from ${message.author} on channel ${message.sourceChannelId}: ${message.text.substring(0, 50)}`
    );

    const storageKey = buildChannelRef("twitch", msg.channelId);
    this.storage.addMessage(storageKey, message);
    this.feed.addMessage(message);

    console.log(`[TwitchChat] Message added to feed for channel ${storageKey}`);
  }

  loadChannelHistory(channelId: string, limit: number): Promise<never[]> {
    return Promise.resolve([]);
  }

  fetchUserProfileImage(userId: string): Promise<string> {
    return Promise.resolve("");
  }

  ngOnDestroy(): void {
    this.unlisten?.();
    this.activeConnections.clear();
  }
}
