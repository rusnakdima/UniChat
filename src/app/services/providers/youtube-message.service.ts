/* sys lib */
import { inject, Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { AuthorizationService } from "@services/features/authorization.service";

/* helpers */
import { extractYoutubeVideoId } from "@utils/youtube-url-parser.util";

@Injectable({
  providedIn: "root",
})
export class YouTubeMessageService {
  private readonly logger = inject(LoggerService);
  private readonly authorizationService = inject(AuthorizationService);

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    const account = this.authorizationService.getAccountByIdSync(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn(
        "YouTubeMessageService",
        "Cannot send message: account not authorized or no access token"
      );
      return false;
    }
    this.logger.info("YouTubeMessageService", "Sending message to channel", channelId);
    void this.sendMessageAsync(channelId, text, account.accessToken);
    return true;
  }

  async deleteMessage(channelId: string, messageId: string, accountId?: string): Promise<boolean> {
    const account = this.authorizationService.getAccountByIdSync(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn(
        "YouTubeMessageService",
        "Cannot delete message: account not authorized or no access token"
      );
      return false;
    }
    this.logger.info(
      "YouTubeMessageService",
      "Deleting message",
      messageId,
      "from channel",
      channelId
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
      this.logger.warn("YouTubeMessageService", "Cannot send empty message");
      return false;
    }

    try {
      const videoId = this.normalizeVideoId(channelId);
      if (!videoId) {
        this.logger.error("YouTubeMessageService", "Invalid video ID", channelId);
        return false;
      }

      this.logger.info("YouTubeMessageService", "Fetching live chat ID for video", videoId);
      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        this.logger.error("YouTubeMessageService", "No live chat ID returned");
        return false;
      }

      this.logger.info("YouTubeMessageService", "Sending message to chat", liveChatId);
      await invoke<string>("youtubeSendMessage", {
        liveChatId,
        messageText: trimmed,
        accessToken,
      });

      this.logger.info("YouTubeMessageService", "Message sent successfully");
      return true;
    } catch (error) {
      this.logger.error("YouTubeMessageService", "Error sending message", error);
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
        this.logger.error("YouTubeMessageService", "Invalid video ID", channelId);
        return false;
      }

      this.logger.info("YouTubeMessageService", "Fetching live chat ID for video", videoId);
      const liveChatId = await invoke<string>("youtubeFetchLiveChatId", {
        videoId,
        accessToken,
      });
      if (!liveChatId) {
        this.logger.error("YouTubeMessageService", "No live chat ID returned");
        return false;
      }

      this.logger.info("YouTubeMessageService", "Deleting message", messageId);
      await invoke<string>("youtubeDeleteMessage", {
        messageId,
        accessToken,
      });

      this.logger.info("YouTubeMessageService", "Message deleted successfully");
      return true;
    } catch (error) {
      this.logger.error("YouTubeMessageService", "Error deleting message", error);
      return false;
    }
  }

  private normalizeVideoId(raw: string): string {
    return extractYoutubeVideoId(raw) ?? "";
  }
}
