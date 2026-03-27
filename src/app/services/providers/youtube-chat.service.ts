import { Injectable } from "@angular/core";
import { ChatMessage, ChatMessageEmote, MessageAction } from "@models/chat.model";
import { createMessageActionState } from "@helpers/chat.helper";
import {
  BaseChatProviderService,
  MockMessageTemplate,
} from "@services/providers/base-chat-provider.service";
import { invoke } from "@tauri-apps/api/core";

type YoutubeTarget = { kind: "channel"; channelId: string } | { kind: "video"; videoId: string };

interface YouTubeChatApiResponse {
  items?: Array<{
    id: string;
    snippet?: {
      type?: string;
      displayMessage?: string;
      publishedAt?: string;
    };
    authorDetails?: {
      displayName?: string;
      channelId?: string;
      isChatSponsor?: boolean;
      profileImageUrl?: string;
    };
  }>;
  nextPageToken?: string;
  pollingIntervalMillis?: number;
}

@Injectable({
  providedIn: "root",
})
export class YouTubeChatService extends BaseChatProviderService {
  readonly platform = "youtube" as const;
  private readonly pollAbortByChannel = new Map<string, AbortController>();
  private readonly nextPageTokenByChannel = new Map<string, string>();

  override connect(channelId: string): void {
    const key = channelId.trim();
    if (!key || this.connectedChannels.has(key)) {
      return;
    }
    this.connectedChannels.add(key);
    void this.runSession(key);
  }

  override disconnect(channelId: string): void {
    const key = channelId.trim();
    this.connectedChannels.delete(key);
    const abort = this.pollAbortByChannel.get(key);
    if (abort) {
      abort.abort();
      this.pollAbortByChannel.delete(key);
    }
    this.nextPageTokenByChannel.delete(key);
  }

  protected getActionStates() {
    const account = this.authorizationService.getAccount("youtube");
    const canReply = account?.authStatus === "authorized";
    return {
      reply: createMessageActionState(
        "reply",
        canReply ? "available" : "disabled",
        canReply ? undefined : "Need YouTube account authorized to reply."
      ),
      delete: createMessageActionState(
        "delete",
        canReply ? "available" : "disabled",
        canReply ? undefined : "Need YouTube account authorized to delete messages."
      ),
    };
  }

  private async runSession(storageKey: string): Promise<void> {
    const abortController = new AbortController();
    this.pollAbortByChannel.set(storageKey, abortController);

    try {
      const target = await this.resolveYoutubeTarget(storageKey);
      if (!target) {
        console.warn(`[YouTubeChat] Could not resolve target for ${storageKey}`);
        return;
      }

      let videoId: string;
      if (target.kind === "video") {
        videoId = target.videoId;
      } else {
        try {
          videoId = await invoke<string>("youtubeGetLiveVideoId", {
            channelHandle: target.channelId,
          });
        } catch {
          console.warn(`[YouTubeChat] No live video found for channel ${target.channelId}`);
          return;
        }
        if (!videoId) {
          console.warn(`[YouTubeChat] No live video found for channel ${target.channelId}`);
          return;
        }
      }

      await this.drainLiveChat(videoId, storageKey, abortController.signal);
    } catch (error) {
      console.error(`[YouTubeChat] Failed to start session for ${storageKey}:`, error);
    } finally {
      this.pollAbortByChannel.delete(storageKey);
    }
  }

  private async resolveYoutubeTarget(canonicalKey: string): Promise<YoutubeTarget | null> {
    if (canonicalKey.startsWith("v:")) {
      return { kind: "video", videoId: canonicalKey.slice(2) };
    }

    if (/^UC[\w-]{22}$/i.test(canonicalKey)) {
      return { kind: "channel", channelId: canonicalKey };
    }

    if (/^[a-zA-Z0-9_-]{11}$/.test(canonicalKey)) {
      return { kind: "video", videoId: canonicalKey };
    }

    if (canonicalKey.startsWith("@")) {
      return { kind: "channel", channelId: canonicalKey };
    }

    return { kind: "channel", channelId: canonicalKey };
  }

  private async drainLiveChat(
    videoId: string,
    storageKey: string,
    signal: AbortSignal
  ): Promise<void> {
    while (this.connectedChannels.has(storageKey) && !signal.aborted) {
      try {
        const stored = this.nextPageTokenByChannel.get(storageKey);
        const pageToken = stored && stored !== "" ? stored : undefined;
        const responseJson = await invoke<string>("youtubeFetchChatMessages", {
          videoId,
          pageToken,
        });
        const response = JSON.parse(responseJson) as YouTubeChatApiResponse;

        this.nextPageTokenByChannel.set(storageKey, response.nextPageToken ?? "");

        for (const item of response.items ?? []) {
          const sourceMessageId = item.id;
          const text = item.snippet?.displayMessage?.trim() ?? "";
          if (!sourceMessageId || !text) {
            continue;
          }

          const author = item.authorDetails?.displayName ?? "YouTube User";
          const sourceUserId = item.authorDetails?.channelId ?? author;
          const badges = item.authorDetails?.isChatSponsor ? ["member"] : [];
          const publishedAt = item.snippet?.publishedAt?.trim();
          let timestamp: string | undefined;
          if (publishedAt) {
            const parsed = new Date(publishedAt);
            if (!Number.isNaN(parsed.getTime())) {
              timestamp = parsed.toISOString();
            }
          }

          let authorAvatarUrl: string | undefined;
          if (item.authorDetails?.profileImageUrl) {
            authorAvatarUrl = item.authorDetails.profileImageUrl;
          }

          this.chatStorageService.addMessage(
            storageKey,
            this.createMessage(storageKey, {
              id: `msg-${sourceMessageId}`,
              sourceMessageId,
              sourceUserId,
              author,
              text,
              badges,
              timestamp,
              rawPayload: {
                providerEvent: item.snippet?.type ?? "liveChatMessage",
                providerChannelId: videoId,
                providerUserId: sourceUserId,
                preview: text.slice(0, 120),
              },
              authorAvatarUrl,
            })
          );
        }

        const waitMillis = Number(response.pollingIntervalMillis ?? 2000);
        await this.delay(Math.max(500, waitMillis), signal);
      } catch (error) {
        console.error("[YouTubeChat] Error fetching messages:", error);
        this.nextPageTokenByChannel.delete(storageKey);
        await this.delay(5000, signal).catch(() => undefined);
      }
    }
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => resolve(), ms);
      const onAbort = () => {
        window.clearTimeout(timeout);
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  sendMessage(channelId: string, text: string): boolean {
    const account = this.authorizationService.getAccount("youtube");
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      return false;
    }
    void this.sendMessageAsync(channelId, text, account.accessToken);
    return true;
  }

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    const account = this.authorizationService.getAccount("youtube");
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      return false;
    }
    return this.deleteMessageAsync(channelId, messageId, account.accessToken);
  }

  private async sendMessageAsync(
    channelId: string,
    text: string,
    accessToken: string
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    try {
      const target = await this.resolveYoutubeTarget(channelId);
      if (!target) {
        return false;
      }

      let videoId: string;
      if (target.kind === "video") {
        videoId = target.videoId;
      } else {
        try {
          videoId = await invoke<string>("youtubeGetLiveVideoId", {
            channelHandle: target.channelId,
          });
        } catch {
          return false;
        }
        if (!videoId) {
          return false;
        }
      }

      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        console.warn("[YouTubeChat] No live chat found for video");
        return false;
      }

      await invoke<string>("youtubeSendMessage", {
        liveChatId,
        messageText: trimmed,
        accessToken,
      });

      return true;
    } catch (error) {
      console.error("[YouTubeChat] Error sending message:", error);
      return false;
    }
  }

  private async deleteMessageAsync(
    channelId: string,
    messageId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const target = await this.resolveYoutubeTarget(channelId);
      if (!target) {
        return false;
      }

      let videoId: string;
      if (target.kind === "video") {
        videoId = target.videoId;
      } else {
        try {
          videoId = await invoke<string>("youtubeGetLiveVideoId", {
            channelHandle: target.channelId,
          });
        } catch {
          return false;
        }
        if (!videoId) {
          return false;
        }
      }

      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        return false;
      }

      await invoke<string>("youtubeDeleteMessage", {
        messageId: `${liveChatId}/${messageId}`,
        accessToken,
      });

      return true;
    } catch (error) {
      console.error("[YouTubeChat] Error deleting message:", error);
      return false;
    }
  }

  async fetchHistory(channelId: string): Promise<ChatMessage[]> {
    return [];
  }
}
