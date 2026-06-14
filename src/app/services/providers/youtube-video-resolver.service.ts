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
export class YouTubeVideoResolverService {
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly tauriApi = inject(TauriApiService);

  async fetchVideoIdFromChannelName(channelName: string): Promise<string | null> {
    this.logger.debug("Fetching video ID for channel", { source: "YouTubeVideoResolverService", channelName });

    try {
      const account = this.authorizationService.getPrimaryAccount("youtube");
      if (account?.accessToken) {
        this.logger.debug("Using OAuth authentication", { source: "YouTubeVideoResolverService" });
        const videoId = await this.tauriApi.youtubeFetchLiveVideoId({
          channelName,
          accessToken: account.accessToken,
        });
        if (videoId) {
          this.logger.debug("Found video ID via OAuth", { source: "YouTubeVideoResolverService", videoId });
          return videoId;
        }
      }

      const apiKey = this.getApiKey();
      if (apiKey) {
        this.logger.debug("Using API key authentication", { source: "YouTubeVideoResolverService" });
        const videoId = await this.tauriApi.youtubeFetchLiveVideoIdByApiKey({
          channelName,
          apiKey,
        });
        if (videoId) {
          this.logger.debug("Found video ID via API key", { source: "YouTubeVideoResolverService", videoId });
          return videoId;
        }
      } else {
        this.logger.warn(
          "No API key configured. Please add your YouTube Data API key in Settings.",
          { source: "YouTubeVideoResolverService" }
        );
      }
    } catch (error) {
      this.logger.error("Error fetching video ID", error, { source: "YouTubeVideoResolverService" });
    }
    return null;
  }

  getApiKey(): string | null {
    try {
      const key = localStorage.getItem("unichat-youtube-api-key") || null;
      if (key) {
        this.logger.debug("API key found (length: %d)", { source: "YouTubeVideoResolverService", "key.length": key.length });
      } else {
        this.logger.debug("No API key found in localStorage", { source: "YouTubeVideoResolverService" });
      }
      return key;
    } catch (error) {
      this.logger.error("Error getting API key", error, { source: "YouTubeVideoResolverService" });
      return null;
    }
  }

  normalizeVideoId(raw: string): string {
    return extractYoutubeVideoId(raw) ?? "";
  }
}
