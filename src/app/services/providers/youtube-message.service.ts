/* sys lib */
import { inject, Injectable } from "@angular/core";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { TauriApiService } from "@app/api/tauri-api.service";

/* helpers */
import { extractYoutubeVideoId } from "@utils/youtube-url-parser.util";

@Injectable({
  providedIn: "root",
})
export class YouTubeMessageService {
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly tauriApi = inject(TauriApiService);

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    const account = this.authorizationService.getAccountByIdSync(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn(
        "Cannot send message: account not authorized or no access token",
        { source: "YouTubeMessageService" }
      );
      return false;
    }
    this.logger.info("Sending message to channel", { source: "YouTubeMessageService", channelId });
    void this.sendMessageAsync(channelId, text, account.accessToken);
    return true;
  }

  async deleteMessage(channelId: string, messageId: string, accountId?: string): Promise<boolean> {
    const account = this.authorizationService.getAccountByIdSync(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn(
        "Cannot delete message: account not authorized or no access token",
        { source: "YouTubeMessageService" }
      );
      return false;
    }
    this.logger.info(
      "Deleting message",
      { source: "YouTubeMessageService", messageId, channelId }
    );
    return this.deleteMessageAsync(channelId, messageId, account.accessToken);
  }

  private async sendMessageAsync(
    channelId: string,
    text: string,
    accessToken: string
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) {
      this.logger.warn("Cannot send empty message", { source: "YouTubeMessageService" });
      return false;
    }

    try {
      const videoId = this.normalizeVideoId(channelId);
      if (!videoId) {
        this.logger.error("Invalid video ID", null, { source: "YouTubeMessageService", channelId });
        return false;
      }

      this.logger.info("Fetching live chat ID for video", { source: "YouTubeMessageService", videoId });
      const liveChatId = await this.tauriApi.youtubeFetchLiveChatId({
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        this.logger.error("No live chat ID returned", null, { source: "YouTubeMessageService" });
        return false;
      }

      this.logger.info("Sending message to chat", { source: "YouTubeMessageService", liveChatId });
      await this.tauriApi.youtubeSendMessage({
        liveChatId,
        messageText: trimmed,
        accessToken,
      });

      this.logger.info("Message sent successfully", { source: "YouTubeMessageService" });
      return true;
    } catch (error) {
      this.logger.error("Error sending message", error, { source: "YouTubeMessageService" });
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
        this.logger.error("Invalid video ID", null, { source: "YouTubeMessageService", channelId });
        return false;
      }

      this.logger.info("Fetching live chat ID for video", { source: "YouTubeMessageService", videoId });
      const liveChatId = await this.tauriApi.youtubeFetchLiveChatId({
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        this.logger.error("No live chat ID returned", null, { source: "YouTubeMessageService" });
        return false;
      }

      this.logger.info("Deleting message", { source: "YouTubeMessageService", messageId });
      await this.tauriApi.youtubeDeleteMessage({
        messageId,
        accessToken,
      });

      this.logger.info("Message deleted successfully", { source: "YouTubeMessageService" });
      return true;
    } catch (error) {
      this.logger.error("Error deleting message", error, { source: "YouTubeMessageService" });
      return false;
    }
  }

  private normalizeVideoId(raw: string): string {
    return extractYoutubeVideoId(raw) ?? "";
  }
}