import { Injectable, inject, OnDestroy } from "@angular/core";
import { TauriApiService } from "@app/api/api.api.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatMessage } from "@entities/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";

const POLL_INTERVAL_MS = 7000;

interface YouTubeMessageItem {
  id: string;
  authorDetails: {
    displayName: string;
    channelId: string;
    profileImageUrl: string;
    isChatSponsor: boolean;
  };
  snippet: {
    type: string;
    publishedAt: string;
    displayMessage: string;
    textMessageDetails?: {
      messageText: string;
    };
  };
}

@Injectable({ providedIn: "root" })
export class YouTubeChatService implements OnDestroy {
  private readonly api = inject(TauriApiService);
  private readonly auth = inject(AuthorizationService);
  private readonly storage = inject(UnifiedStorageService);
  private readonly feed = inject(DashboardFeedDataService);

  private activePollers = new Map<
    string,
    {
      videoId: string;
      timer: ReturnType<typeof setInterval>;
      seenIds: Set<string>;
      nextPageToken: string | null;
    }
  >();

  get connectedChannels(): string[] {
    return Array.from(this.activePollers.keys());
  }

  async connect(videoIdOrChannel: string): Promise<void> {
    const key = videoIdOrChannel.toLowerCase();
    if (this.activePollers.has(key)) {
      console.log(`[YouTubeChat] Already polling ${videoIdOrChannel}`);
      return;
    }

    const account = this.auth.getPrimaryAccount("youtube");
    const apiKey = account?.accessToken || "";

    let videoId = videoIdOrChannel;

    if (videoId.includes("youtube.com") || videoId.includes("youtu.be")) {
      const parsed = this.parseVideoId(videoId);
      if (!parsed) {
        console.error(`[YouTubeChat] Invalid YouTube URL: ${videoId}`);
        return;
      }
      videoId = parsed;
    }

    try {
      if (apiKey) {
        const result = await this.api.youtubeFetchLiveVideoIdByApiKey({
          channelName: videoId,
          apiKey,
        });
        if (result) {
          videoId = result;
        }
      }
    } catch {
      // videoId might already be a valid video ID
    }

    if (!videoId) {
      console.error(`[YouTubeChat] Could not determine video ID for ${videoIdOrChannel}`);
      return;
    }

    const poller = {
      videoId,
      timer: null as unknown as ReturnType<typeof setInterval>,
      seenIds: new Set<string>(),
      nextPageToken: null as string | null,
    };

    poller.timer = setInterval(() => this.pollMessages(poller, apiKey), POLL_INTERVAL_MS);
    this.activePollers.set(key, poller);
    console.log(`[YouTubeChat] Started polling video ${videoId}`);

    await this.pollMessages(poller, apiKey);
  }

  disconnect(): void {
    for (const [key, poller] of this.activePollers) {
      clearInterval(poller.timer);
      console.log(`[YouTubeChat] Stopped polling ${key}`);
    }
    this.activePollers.clear();
  }

  disconnectChannel(channelName: string): void {
    const key = channelName.toLowerCase();
    const poller = this.activePollers.get(key);
    if (poller) {
      clearInterval(poller.timer);
      this.activePollers.delete(key);
      console.log(`[YouTubeChat] Stopped polling ${channelName}`);
    }
  }

  sendMessage(_text: string): void {
    console.warn("[YouTubeChat] Sending messages is not supported via API key");
  }

  private async pollMessages(
    poller: {
      videoId: string;
      seenIds: Set<string>;
      nextPageToken: string | null;
    },
    apiKey: string
  ): Promise<void> {
    try {
      const raw = await this.api.youtubeFetchChatMessages({
        videoId: poller.videoId,
        pageToken: poller.nextPageToken || undefined,
        apiKey: apiKey || undefined,
      });

      let data: { items?: YouTubeMessageItem[]; nextPageToken?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.nextPageToken) {
        poller.nextPageToken = data.nextPageToken;
      }

      const items = data.items || [];
      for (const item of items) {
        if (poller.seenIds.has(item.id)) continue;
        poller.seenIds.add(item.id);

        const message = this.toChatMessage(item, poller.videoId);
        const storageKey = buildChannelRef("youtube", poller.videoId);
        this.storage.addMessage(storageKey, message);
        this.feed.addMessage(message);
      }
    } catch (error) {
      console.debug(`[YouTubeChat] Poll error for ${poller.videoId}:`, error);
    }
  }

  private toChatMessage(item: YouTubeMessageItem, videoId: string): ChatMessage {
    const text =
      item.snippet?.textMessageDetails?.messageText || item.snippet?.displayMessage || "";

    return {
      id: `yt-${item.id}`,
      platform: "youtube",
      sourceMessageId: item.id,
      sourceChannelId: videoId,
      sourceUserId: item.authorDetails?.channelId || "",
      author: item.authorDetails?.displayName || "unknown",
      text,
      timestamp: item.snippet?.publishedAt || new Date().toISOString(),
      badges: [],
      isSupporter: item.authorDetails?.isChatSponsor || false,
      isOutgoing: false,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { kind: "reply", status: "disabled" },
        delete: { kind: "delete", status: "disabled" },
      },
      rawPayload: {
        providerEvent: "youtube-message",
        providerChannelId: videoId,
        providerUserId: item.authorDetails?.channelId || "",
        preview: text.slice(0, 100),
        msgId: item.id,
      },
      authorAvatarUrl: item.authorDetails?.profileImageUrl || undefined,
      receivedAt: Date.now(),
    };
  }

  private parseVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
