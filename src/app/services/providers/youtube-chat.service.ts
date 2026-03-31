/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";
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
  private readonly errorService = inject(ConnectionErrorService);

  /** Rate limit state per channel */
  private readonly rateLimitState = new Map<
    string,
    {
      consecutive429s: number;
      backoffMs: number;
      lastRetryAt: number;
    }
  >();

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

  protected override getActionStates() {
    return {
      reply: createMessageActionState(
        "reply",
        "disabled",
        "Reply is available only through linked account actions."
      ),
      delete: createMessageActionState(
        "delete",
        "disabled",
        "Delete requires verified moderation for this channel."
      ),
    };
  }

  private async runSession(storageKey: string): Promise<void> {
    const abortController = new AbortController();
    this.pollAbortByChannel.set(storageKey, abortController);

    console.log("[YouTube] Starting session for:", storageKey);

    try {
      // Try to get video ID - either from storage key (if it's already a video ID)
      // or by fetching from channel name (if connected via OAuth)
      let videoId: string | null = this.normalizeVideoId(storageKey);
      console.log("[YouTube] Normalized video ID:", videoId || "none");

      // If not a valid video ID, try to fetch from channel name
      if (!videoId) {
        console.log("[YouTube] Fetching video ID from channel name:", storageKey);
        videoId = await this.fetchVideoIdFromChannelName(storageKey);
      }

      if (!videoId) {
        console.error("[YouTube] Could not find video ID for:", storageKey);
        this.errorService.reportChannelNotFound(storageKey, "youtube");
        return;
      }

      console.log("[YouTube] Starting chat polling for video:", videoId);
      await this.drainLiveChat(videoId, storageKey, abortController.signal);
    } catch (error) {
      console.error("[YouTube] Session error:", error);
      this.errorService.reportNetworkError(storageKey, "Failed to start chat session", true);
    } finally {
      this.pollAbortByChannel.delete(storageKey);
    }
  }

  private async fetchVideoIdFromChannelName(channelName: string): Promise<string | null> {
    console.log("[YouTube] Fetching video ID for channel:", channelName);

    try {
      // Try to get from authorized account
      const account = this.authorizationService.getPrimaryAccount("youtube");
      if (account?.accessToken) {
        console.log("[YouTube] Using OAuth authentication");
        // Fetch current live video ID from channel using OAuth
        const videoId = await invoke<string>("youtubeFetchLiveVideoId", {
          channelName,
          accessToken: account.accessToken,
        });
        if (videoId) {
          console.log("[YouTube] Found video ID via OAuth:", videoId);
          return videoId;
        }
      }

      // Fallback: try API key method
      const apiKey = this.getApiKey();
      if (apiKey) {
        console.log("[YouTube] Using API key authentication");
        const videoId = await invoke<string>("youtubeFetchLiveVideoIdByApiKey", {
          channelName,
          apiKey,
        });
        if (videoId) {
          console.log("[YouTube] Found video ID via API key:", videoId);
          return videoId;
        }
      } else {
        console.warn("[YouTube] No API key configured. Please add your YouTube Data API key in Settings.");
      }
    } catch (error) {
      console.error("[YouTube] Error fetching video ID:", error);
    }
    return null;
  }

  private getApiKey(): string | null {
    try {
      const key = localStorage.getItem("unichat-youtube-api-key") || null;
      if (key) {
        console.log("[YouTube] API key found (length:", key.length, ")");
      } else {
        console.log("[YouTube] No API key found in localStorage");
      }
      return key;
    } catch (error) {
      console.error("[YouTube] Error getting API key:", error);
      return null;
    }
  }

  private normalizeVideoId(raw: string): string {
    const trimmed = raw.trim().replace(/^v:/i, "");
    return /^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : "";
  }

  private async drainLiveChat(
    videoId: string,
    storageKey: string,
    signal: AbortSignal
  ): Promise<void> {
    let consecutiveErrors = 0;

    // Initialize rate limit state
    this.rateLimitState.set(storageKey, {
      consecutive429s: 0,
      backoffMs: 2000,
      lastRetryAt: 0,
    });

    console.log("[YouTube] Starting live chat polling for video:", videoId);

    while (this.connectedChannels.has(storageKey) && !signal.aborted) {
      try {
        const stored = this.nextPageTokenByChannel.get(storageKey);
        const pageToken = stored && stored !== "" ? stored : undefined;

        console.log("[YouTube] Fetching chat messages, pageToken:", pageToken || "initial");

        const apiKey = this.getApiKey();
        const responseJson = await invoke<string>("youtubeFetchChatMessages", {
          videoId,
          pageToken,
          apiKey: apiKey || undefined,
        });
        const response = JSON.parse(responseJson) as YouTubeChatApiResponse;

        this.nextPageTokenByChannel.set(storageKey, response.nextPageToken ?? "");
        consecutiveErrors = 0; // Reset error counter on success

        // Reset rate limit state on success
        const state = this.rateLimitState.get(storageKey);
        if (state && state.consecutive429s > 0) {
          state.consecutive429s = 0;
          state.backoffMs = 2000;
          this.rateLimitState.set(storageKey, state);
        }

        const messageCount = response.items?.length ?? 0;
        console.log(`[YouTube] Received ${messageCount} messages`);

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
        console.log("[YouTube] Waiting", waitMillis, "ms before next poll");
        await this.delay(Math.max(500, waitMillis), signal);
      } catch (error: unknown) {
        consecutiveErrors++;
        console.error("[YouTube] Error fetching chat messages:", error);

        // Check for rate limit (429)
        const isRateLimited = this.isRateLimitError(error);
        if (isRateLimited) {
          const state = this.rateLimitState.get(storageKey);
          if (state) {
            state.consecutive429s++;
            // Exponential backoff: 2s, 4s, 8s, 16s, 32s (cap at 32s)
            state.backoffMs = Math.min(32000, state.backoffMs * 2);
            state.lastRetryAt = Date.now();
            this.rateLimitState.set(storageKey, state);

            this.errorService.reportRateLimited(storageKey, "youtube");
          }
        }

        // Report error after consecutive failures
        if (consecutiveErrors >= 2) {
          this.errorService.reportNetworkError(
            storageKey,
            "Connection lost. Reconnecting...",
            true
          );
        }

        this.nextPageTokenByChannel.delete(storageKey);

        // Use rate limit backoff if available, otherwise default
        const state = this.rateLimitState.get(storageKey);
        const delayMs = state && state.consecutive429s > 0 ? state.backoffMs : 5000;

        await this.delay(delayMs, signal).catch(() => undefined);
      }
    }

    console.log("[YouTube] Stopping live chat polling for:", storageKey);
    // Clean up rate limit state
    this.rateLimitState.delete(storageKey);
  }

  /**
   * Check if error is a rate limit (429) error
   */
  private isRateLimitError(error: unknown): boolean {
    const errorMsg = String(error);
    return (
      errorMsg.includes("429") || errorMsg.includes("rate limit") || errorMsg.includes("quota")
    );
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

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    const account = this.authorizationService.getAccountById(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      console.warn("[YouTube] Cannot send message: account not authorized or no access token");
      return false;
    }
    console.log("[YouTube] Sending message to channel:", channelId);
    void this.sendMessageAsync(channelId, text, account.accessToken);
    return true;
  }

  async deleteMessage(channelId: string, messageId: string, accountId?: string): Promise<boolean> {
    const account = this.authorizationService.getAccountById(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      console.warn("[YouTube] Cannot delete message: account not authorized or no access token");
      return false;
    }
    console.log("[YouTube] Deleting message:", messageId, "from channel:", channelId);
    return this.deleteMessageAsync(channelId, messageId, account.accessToken);
  }

  private async sendMessageAsync(
    channelId: string,
    text: string,
    accessToken: string
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) {
      console.warn("[YouTube] Cannot send empty message");
      return false;
    }

    try {
      const videoId = this.normalizeVideoId(channelId);
      if (!videoId) {
        console.error("[YouTube] Invalid video ID:", channelId);
        return false;
      }

      console.log("[YouTube] Fetching live chat ID for video:", videoId);
      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        console.error("[YouTube] No live chat ID returned");
        return false;
      }

      console.log("[YouTube] Sending message to chat:", liveChatId);
      await invoke<string>("youtubeSendMessage", {
        liveChatId,
        messageText: trimmed,
        accessToken,
      });

      console.log("[YouTube] Message sent successfully");
      return true;
    } catch (error) {
      console.error("[YouTube] Error sending message:", error);
      return false;
    }
  }

  private async deleteMessageAsync(
    channelId: string,
    messageId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const videoId = this.normalizeVideoId(channelId);
      if (!videoId) {
        console.error("[YouTube] Invalid video ID:", channelId);
        return false;
      }

      console.log("[YouTube] Fetching live chat ID for video:", videoId);
      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        console.error("[YouTube] No live chat ID returned");
        return false;
      }

      console.log("[YouTube] Deleting message:", messageId);
      await invoke<string>("youtubeDeleteMessage", {
        messageId,
        accessToken,
      });

      console.log("[YouTube] Message deleted successfully");
      return true;
    } catch (error) {
      console.error("[YouTube] Error deleting message:", error);
      return false;
    }
  }

  /**
   * Fetch YouTube chat history
   * TODO: Implement YouTube history loading via YouTube Live Chat API
   * Currently returns empty array - feature not yet supported
   * @see TwitchChatService.fetchHistory() for reference implementation
   */
  async fetchHistory(channelId: string): Promise<ChatMessage[]> {
    // TODO: Implement using YouTube Data API v3 - liveChatMessages.list
    // Requires OAuth scope: https://www.googleapis.com/auth/youtube.force-ssl
    return [];
  }
}
