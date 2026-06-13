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
export class YouTubeVideoResolverService {
  private readonly logger = inject(LoggerService);
  private readonly authorizationService = inject(AuthorizationService);

  async fetchVideoIdFromChannelName(channelName: string): Promise<string | null> {
    this.logger.debug("YouTubeVideoResolverService", "Fetching video ID for channel", channelName);

    try {
      const account = this.authorizationService.getPrimaryAccount("youtube");
      if (account?.accessToken) {
        this.logger.debug("YouTubeVideoResolverService", "Using OAuth authentication");
        const videoId = await invoke<string>("youtubeFetchLiveVideoId", {
          channelName,
          accessToken: account.accessToken,
        });
        if (videoId) {
          this.logger.debug("YouTubeVideoResolverService", "Found video ID via OAuth", videoId);
          return videoId;
        }
      }

      const apiKey = this.getApiKey();
      if (apiKey) {
        this.logger.debug("YouTubeVideoResolverService", "Using API key authentication");
        const videoId = await invoke<string>("youtubeFetchLiveVideoIdByApiKey", {
          channelName,
          apiKey,
        });
        if (videoId) {
          this.logger.debug("YouTubeVideoResolverService", "Found video ID via API key", videoId);
          return videoId;
        }
      } else {
        this.logger.warn(
          "YouTubeVideoResolverService",
          "No API key configured. Please add your YouTube Data API key in Settings."
        );
      }
    } catch (error) {
      this.logger.error("YouTubeVideoResolverService", "Error fetching video ID", error);
    }
    return null;
  }

  getApiKey(): string | null {
    try {
      const key = localStorage.getItem("unichat-youtube-api-key") || null;
      if (key) {
        this.logger.debug("YouTubeVideoResolverService", "API key found (length: %d)", key.length);
      } else {
        this.logger.debug("YouTubeVideoResolverService", "No API key found in localStorage");
      }
      return key;
    } catch (error) {
      this.logger.error("YouTubeVideoResolverService", "Error getting API key", error);
      return null;
    }
  }

  normalizeVideoId(raw: string): string {
    return extractYoutubeVideoId(raw) ?? "";
  }
}
