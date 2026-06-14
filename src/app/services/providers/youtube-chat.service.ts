/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { YouTubeVideoResolverService } from "@services/providers/youtube-video-resolver.service";
import { YouTubePollingService } from "@services/providers/youtube-polling.service";
import { YouTubeMessageService } from "@services/providers/youtube-message.service";

/* helpers */
import { createMessageActionState } from "@shared/utils/chat.helper";

@Injectable({
  providedIn: "root",
})
export class YouTubeChatService extends BaseChatProviderService {
  readonly platform = "youtube" as const;
  private readonly pollAbortByChannel = new Map<string, AbortController>();
  private readonly nextPageTokenByChannel = new Map<string, string>();
  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly videoResolver = inject(YouTubeVideoResolverService);
  private readonly pollingService = inject(YouTubePollingService);
  private readonly messageService = inject(YouTubeMessageService);

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

  reconnectChannel(channelId: string): void {
    const key = channelId.trim();
    if (!this.connectedChannels.has(key)) {
      return;
    }

    this.logger.info("Reconnecting channel", { source: "YouTubeChatService", key, "with new token": true });
    this.disconnect(key);
    this.connect(key);
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

    this.logger.debug("Starting session for", { source: "YouTubeChatService", storageKey });

    try {
      let videoId: string | null = this.videoResolver.normalizeVideoId(storageKey);
      this.logger.debug("Normalized video ID", { source: "YouTubeChatService", videoId: videoId || "none" });

      if (!videoId) {
        this.logger.debug("Fetching video ID from channel name", { source: "YouTubeChatService", storageKey });
        videoId = await this.videoResolver.fetchVideoIdFromChannelName(storageKey);
      }

      if (!videoId) {
        this.logger.error("Could not find video ID", null, { source: "YouTubeChatService", storageKey });
        this.errorService.reportChannelNotFound(storageKey, "youtube");
        return;
      }

      this.logger.debug("Starting chat polling for video", { source: "YouTubeChatService", videoId });
      await this.pollingService.drainLiveChat(
        videoId,
        storageKey,
        abortController.signal,
        this.connectedChannels,
        this.nextPageTokenByChannel,
        this
      );
    } catch (error) {
      this.logger.error("Session error", error, { source: "YouTubeChatService" });
      this.errorService.reportNetworkError(storageKey, "Failed to start chat session", true);
    } finally {
      this.pollAbortByChannel.delete(storageKey);
    }
  }

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    return this.messageService.sendMessage(channelId, text, accountId);
  }

  async deleteMessage(channelId: string, messageId: string, accountId?: string): Promise<boolean> {
    return this.messageService.deleteMessage(channelId, messageId, accountId);
  }

  async fetchHistory(channelId: string): Promise<ChatMessage[]> {
    return [];
  }
}
