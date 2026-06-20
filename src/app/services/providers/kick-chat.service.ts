import { Injectable, inject, OnDestroy } from "@angular/core";
import { TauriApiService } from "@app/api/api.api.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatMessage } from "@entities/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";

const POLL_INTERVAL_MS = 5000;

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

@Injectable({ providedIn: "root" })
export class KickChatService implements OnDestroy {
  private readonly api = inject(TauriApiService);
  private readonly storage = inject(UnifiedStorageService);
  private readonly feed = inject(DashboardFeedDataService);

  private activePollers = new Map<
    string,
    {
      channelSlug: string;
      chatroomId: number;
      timer: ReturnType<typeof setInterval>;
      seenIds: Set<string>;
      lastMessageTime: string;
    }
  >();

  get connectedChannels(): string[] {
    return Array.from(this.activePollers.keys());
  }

  async connect(channelName: string): Promise<void> {
    const channelSlug = channelName.toLowerCase();
    if (this.activePollers.has(channelSlug)) {
      console.log(`[KickChat] Already polling ${channelName}`);
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

      const poller = {
        channelSlug,
        chatroomId,
        timer: null as unknown as ReturnType<typeof setInterval>,
        seenIds: new Set<string>(),
        lastMessageTime: new Date().toISOString(),
      };

      poller.timer = setInterval(() => this.pollMessages(poller), POLL_INTERVAL_MS);
      this.activePollers.set(channelSlug, poller);
      console.log(`[KickChat] Started polling ${channelName} (chatroom: ${chatroomId})`);

      await this.pollMessages(poller);
    } catch (error) {
      console.error(`[KickChat] Failed to connect to ${channelName}:`, error);
    }
  }

  disconnect(): void {
    for (const [slug, poller] of this.activePollers) {
      clearInterval(poller.timer);
      console.log(`[KickChat] Stopped polling ${slug}`);
    }
    this.activePollers.clear();
  }

  disconnectChannel(channelName: string): void {
    const slug = channelName.toLowerCase();
    const poller = this.activePollers.get(slug);
    if (poller) {
      clearInterval(poller.timer);
      this.activePollers.delete(slug);
      console.log(`[KickChat] Stopped polling ${channelName}`);
    }
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

  private async pollMessages(poller: {
    channelSlug: string;
    chatroomId: number;
    seenIds: Set<string>;
    lastMessageTime: string;
  }): Promise<void> {
    try {
      const raw = await this.api.invoke<string>("kick_fetch_recent_messages", {
        channelSlug: poller.channelSlug,
        chatroomId: poller.chatroomId,
      });

      let messages: KickMessageData[] = [];
      try {
        const parsed = JSON.parse(raw);
        messages = Array.isArray(parsed) ? parsed : parsed.data || [];
      } catch {
        return;
      }

      for (const msg of messages) {
        if (poller.seenIds.has(msg.id)) continue;
        poller.seenIds.add(msg.id);

        if (msg.created_at && msg.created_at <= poller.lastMessageTime) continue;

        const message = this.toChatMessage(msg, poller.channelSlug);
        const storageKey = buildChannelRef("kick", poller.channelSlug);
        this.storage.addMessage(storageKey, message);
        this.feed.addMessage(message);
      }

      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.created_at) {
          poller.lastMessageTime = lastMsg.created_at;
        }
      }
    } catch (error) {
      console.debug(`[KickChat] Poll error for ${poller.channelSlug}:`, error);
    }
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
