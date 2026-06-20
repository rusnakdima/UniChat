import { Injectable, inject, OnDestroy } from "@angular/core";
import { TauriApiService } from "@app/api/api.api.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatMessage } from "@entities/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";

const PUSHER_WS_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0";
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

interface KickMessageData {
  id: string;
  content: string;
  sender: {
    id: number;
    username: string;
    slug: string;
    identity: {
      color: string;
      badges: { type: string; text: string }[];
    };
  };
  created_at: string;
}

interface PusherMessage {
  event: string;
  channel: string;
  data: string;
}

@Injectable({ providedIn: "root" })
export class KickChatService implements OnDestroy {
  private readonly api = inject(TauriApiService);
  private readonly storage = inject(UnifiedStorageService);
  private readonly feed = inject(DashboardFeedDataService);

  private socketByChannel = new Map<string, WebSocket>();
  private channelInfoByChannel = new Map<string, { chatroomId: number; channelSlug: string }>();
  private reconnectTimerByChannel = new Map<string, number>();
  private seenMessageIds = new Set<string>();

  get connectedChannels(): string[] {
    return Array.from(this.socketByChannel.keys());
  }

  async connect(channelName: string): Promise<void> {
    const channelSlug = channelName.toLowerCase();
    if (this.socketByChannel.has(channelSlug)) {
      console.log(`[KickChat] Already connected to ${channelName}`);
      return;
    }

    try {
      const channelInfo = await this.api.kickFetchChatroomId({
        channelSlug,
        accessToken: null,
      });

      const chatroomId = channelInfo?.chatroomId || 0;
      if (!chatroomId) {
        console.error(`[KickChat] No chatroom ID for ${channelName}`);
        return;
      }

      this.channelInfoByChannel.set(channelSlug, { chatroomId, channelSlug });
      this.openSocket(channelSlug, chatroomId);
    } catch (error) {
      console.error(`[KickChat] Failed to connect to ${channelName}:`, error);
    }
  }

  disconnect(): void {
    for (const [slug, socket] of this.socketByChannel) {
      socket.close();
      console.log(`[KickChat] Disconnected socket for ${slug}`);
    }
    this.socketByChannel.clear();
    this.channelInfoByChannel.clear();
    for (const timer of this.reconnectTimerByChannel.values()) {
      window.clearTimeout(timer);
    }
    this.reconnectTimerByChannel.clear();
    this.seenMessageIds.clear();
  }

  disconnectChannel(channelName: string): void {
    const slug = channelName.toLowerCase();
    const socket = this.socketByChannel.get(slug);
    if (socket) {
      socket.close();
      this.socketByChannel.delete(slug);
    }
    this.channelInfoByChannel.delete(slug);
    const timer = this.reconnectTimerByChannel.get(slug);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.reconnectTimerByChannel.delete(slug);
    }
    console.log(`[KickChat] Disconnected channel ${channelName}`);
  }

  async sendMessage(text: string): Promise<void> {
    console.warn("[KickChat] Sending messages via Kick requires an access token");
  }

  fetchUserInfo(
    userId: string
  ): Promise<{ userId: string; username: string; avatarUrl: string; profile_pic_url?: string }> {
    return this.api
      .kickFetchUserInfo({ username: userId })
      .then((data: any) => ({
        userId: data?.id || userId,
        username: data?.username || userId,
        avatarUrl: data?.profile_pic_url || "",
        profile_pic_url: data?.profile_pic_url,
      }))
      .catch(() => ({
        userId,
        username: userId,
        avatarUrl: "",
      }));
  }

  private openSocket(channelSlug: string, chatroomId: number): void {
    console.log(`[KickChat] Opening WebSocket for ${channelSlug}, chatroomId: ${chatroomId}`);

    const socket = new WebSocket(PUSHER_WS_URL);
    this.socketByChannel.set(channelSlug, socket);

    socket.addEventListener("open", () => {
      console.log(
        `[KickChat] WebSocket opened for ${channelSlug}, subscribing to chatrooms.${chatroomId}.v2`
      );
      socket.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: {
            channel: `chatrooms.${chatroomId}.v2`,
          },
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const data = String(event.data ?? "");
      this.handleSocketMessage(channelSlug, data);
    });

    socket.addEventListener("error", (event) => {
      console.error(`[KickChat] WebSocket error for ${channelSlug}:`, event);
    });

    socket.addEventListener("close", (event) => {
      console.log(
        `[KickChat] WebSocket closed for ${channelSlug}, code: ${event.code}, reason: ${event.reason}`
      );
      this.socketByChannel.delete(channelSlug);
      if (this.channelInfoByChannel.has(channelSlug)) {
        this.scheduleReconnect(channelSlug);
      }
    });
  }

  private handleSocketMessage(channelSlug: string, data: string): void {
    try {
      const pusherMsg: PusherMessage = JSON.parse(data);

      if (pusherMsg.event === "pusher:subscription_succeeded") {
        console.log(`[KickChat] Subscribed to channel ${channelSlug}`);
        return;
      }

      if (pusherMsg.event === "pusher:subscription_error") {
        console.error(`[KickChat] Subscription error for ${channelSlug}:`, data);
        return;
      }

      if (pusherMsg.event === "App\\Events\\ChatMessageEvent") {
        const messageData =
          typeof pusherMsg.data === "string" ? JSON.parse(pusherMsg.data) : pusherMsg.data;
        this.handleChatMessage(channelSlug, messageData);
      }
    } catch (e) {
      console.error(`[KickChat] Failed to parse message for ${channelSlug}:`, e);
    }
  }

  private handleChatMessage(channelSlug: string, data: any): void {
    console.log(
      `[KickChat] Raw message data for ${channelSlug}:`,
      JSON.stringify(data).substring(0, 500)
    );
    const msg = data.message || data;
    console.log(`[KickChat] Parsed msg:`, JSON.stringify(msg).substring(0, 500));
    const msgId = String(msg.id);

    if (this.seenMessageIds.has(msgId)) {
      return;
    }
    this.seenMessageIds.add(msgId);

    if (this.seenMessageIds.size > 10000) {
      const entriesToDelete = this.seenMessageIds.size - 5000;
      const iter = this.seenMessageIds.values();
      for (let i = 0; i < entriesToDelete; i++) {
        const next = iter.next().value;
        if (next !== undefined) {
          this.seenMessageIds.delete(next);
        }
      }
    }

    const kickMsg: KickMessageData = {
      id: msgId,
      content: msg.content || msg.message?.content || "",
      sender: {
        id: msg.sender?.id || 0,
        username: msg.sender?.username || "unknown",
        slug: msg.sender?.slug || "",
        identity: {
          color: msg.sender?.identity?.color || "#ffffff",
          badges: msg.sender?.identity?.badges || [],
        },
      },
      created_at: msg.created_at || new Date().toISOString(),
    };

    const message = this.toChatMessage(kickMsg, channelSlug);
    console.log(
      `[KickChat] Received message ${message.id} from ${message.author}: ${message.text.substring(0, 50)}`
    );

    const storageKey = buildChannelRef("kick", channelSlug);
    this.storage.addMessage(storageKey, message);
    this.feed.addMessage(message);
  }

  private scheduleReconnect(channelSlug: string): void {
    const existingTimer = this.reconnectTimerByChannel.get(channelSlug);
    if (existingTimer !== undefined) {
      return;
    }

    const channelInfo = this.channelInfoByChannel.get(channelSlug);
    if (!channelInfo) {
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectTimerByChannel.size),
      RECONNECT_MAX_DELAY_MS
    );

    console.log(`[KickChat] Scheduling reconnect for ${channelSlug} in ${delay}ms`);

    const timer = window.setTimeout(() => {
      this.reconnectTimerByChannel.delete(channelSlug);
      if (this.channelInfoByChannel.has(channelSlug)) {
        console.log(`[KickChat] Reconnecting to ${channelSlug}`);
        this.openSocket(channelSlug, channelInfo.chatroomId);
      }
    }, delay);

    this.reconnectTimerByChannel.set(channelSlug, timer);
  }

  private toChatMessage(msg: KickMessageData, channelSlug: string): ChatMessage {
    const messageId = `kick-${msg.id}`;
    const badges = msg.sender?.identity?.badges?.map((b) => b.text) || [];

    return {
      id: messageId,
      platform: "kick",
      sourceMessageId: String(msg.id),
      sourceChannelId: channelSlug,
      sourceUserId: String(msg.sender?.id || ""),
      author: msg.sender?.username || "unknown",
      text: msg.content || "",
      timestamp: msg.created_at || new Date().toISOString(),
      badges,
      isSupporter: badges.includes("subscriber"),
      isOutgoing: false,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { kind: "reply", status: "disabled" },
        delete: { kind: "delete", status: "disabled" },
      },
      rawPayload: {
        providerEvent: "kick-message",
        providerChannelId: channelSlug,
        providerUserId: String(msg.sender?.id || ""),
        preview: (msg.content || "").slice(0, 100),
        msgId: String(msg.id),
      },
      receivedAt: Date.now(),
    };
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
