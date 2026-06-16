/* sys lib */
import { inject, Injectable } from "@angular/core";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { TauriApiService } from "@app/api/tauri-api.service";
import {
  POLLING_INTERVAL_MS,
  YOUTUBE_BACKOFF_MAX_MS,
  RATE_LIMIT_CODE,
} from "@shared/utils/constants";

/* helpers */
import { POLLING_INTERVAL_MS as CONSTPolling_INTERVAL_MS } from "@app/shared/utils/constants";

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
export class YouTubePollingService {
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly errorService = inject(ConnectionErrorService);
  private readonly chatStorageService = inject(UnifiedStorageService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly tauriApi = inject(TauriApiService);

  private readonly rateLimitState = new Map<
    string,
    {
      consecutive429s: number;
      backoffMs: number;
      lastRetryAt: number;
    }
  >();

  async drainLiveChat(
    videoId: string,
    storageKey: string,
    signal: AbortSignal,
    connectedChannels: Set<string>,
    nextPageTokenByChannel: Map<string, string>,
    baseService: BaseChatProviderService
  ): Promise<void> {
    let consecutiveErrors = 0;

    this.rateLimitState.set(storageKey, {
      consecutive429s: 0,
      backoffMs: POLLING_INTERVAL_MS,
      lastRetryAt: 0,
    });

    this.logger.debug("Starting live chat polling for video", {
      source: "YouTubePollingService",
      videoId,
    });

    while (connectedChannels.has(storageKey) && !signal.aborted) {
      try {
        const stored = nextPageTokenByChannel.get(storageKey);
        const pageToken = stored && stored !== "" ? stored : undefined;

        this.logger.debug("Fetching chat messages, pageToken", {
          source: "YouTubePollingService",
          pageToken: pageToken || "initial",
        });

        const apiKey = this.getApiKey();
        const responseJson = await this.tauriApi.youtubeFetchChatMessages({
          videoId,
          pageToken,
          apiKey: apiKey || undefined,
        });
        const response = JSON.parse(responseJson) as YouTubeChatApiResponse;

        nextPageTokenByChannel.set(storageKey, response.nextPageToken ?? "");
        consecutiveErrors = 0;

        const state = this.rateLimitState.get(storageKey);
        if (state && state.consecutive429s > 0) {
          state.consecutive429s = 0;
          state.backoffMs = POLLING_INTERVAL_MS;
          this.rateLimitState.set(storageKey, state);
        }

        const messageCount = response.items?.length ?? 0;
        this.logger.debug("Received %d messages", {
          source: "YouTubePollingService",
          messageCount,
        });

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
            baseService.createMessage(storageKey, {
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

        const waitMillis = Number(response.pollingIntervalMillis ?? POLLING_INTERVAL_MS);
        this.logger.debug("Waiting %d ms before next poll", {
          source: "YouTubePollingService",
          waitMillis,
        });
        await this.delay(Math.max(500, waitMillis), signal);
      } catch (error: unknown) {
        consecutiveErrors++;
        this.logger.error("Error fetching chat messages", error, {
          source: "YouTubePollingService",
        });

        const isRateLimited = this.isRateLimitError(error);
        if (isRateLimited) {
          const state = this.rateLimitState.get(storageKey);
          if (state) {
            state.consecutive429s++;
            state.backoffMs = Math.min(YOUTUBE_BACKOFF_MAX_MS, state.backoffMs * 2);
            state.lastRetryAt = Date.now();
            this.rateLimitState.set(storageKey, state);

            this.errorService.reportRateLimited(storageKey, "youtube");
          }
        }

        if (consecutiveErrors >= 2) {
          this.errorService.reportNetworkError(
            storageKey,
            "Connection lost. Reconnecting...",
            true
          );
        }

        nextPageTokenByChannel.delete(storageKey);

        const state = this.rateLimitState.get(storageKey);
        const delayMs = state && state.consecutive429s > 0 ? state.backoffMs : 5000;

        await this.delay(delayMs, signal).catch(() => undefined);
      }
    }

    this.logger.info("Stopping live chat polling for", {
      source: "YouTubePollingService",
      storageKey,
    });
    this.rateLimitState.delete(storageKey);
  }

  isRateLimitError(error: unknown): boolean {
    const errorMsg = String(error);
    return (
      errorMsg.includes(RATE_LIMIT_CODE.toString()) ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("quota")
    );
  }

  async delay(ms: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => resolve(), ms);
      const onAbort = () => {
        window.clearTimeout(timeout);
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private getApiKey(): string | null {
    try {
      const key = localStorage.getItem("unichat-youtube-api-key") || null;
      return key;
    } catch {
      return null;
    }
  }
}
