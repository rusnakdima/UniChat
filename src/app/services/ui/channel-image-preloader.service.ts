/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChannelImageLoaderService } from "@services/ui/channel-image-loader.service";

/**
 * Channel Image Preloader Service
 * Preloads channel profile images on app startup
 * Loads images in batches to avoid rate limiting
 */
@Injectable({
  providedIn: "root",
})
export class ChannelImagePreloaderService {
  private readonly chatListService = inject(ChatListService);
  private readonly channelImageLoader = inject(ChannelImageLoaderService);
  private readonly logger = inject(LoggerService);

  private preloadComplete = false;

  /**
   * Preload all visible channel images
   * Loads in batches to avoid rate limits
   */
  async preloadAllVisibleChannels(): Promise<void> {
    if (this.preloadComplete) {
      return;
    }

    const channels = this.chatListService.getVisibleChannels();
    if (channels.length === 0) {
      this.preloadComplete = true;
      return;
    }

    this.logger.info(
      "ChannelImagePreloaderService",
      "Preloading images for",
      channels.length,
      "channels"
    );

    // Load in batches to avoid rate limits
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 200;

    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE);

      // Load batch in parallel
      await Promise.all(
        batch.map((channel) =>
          this.channelImageLoader.loadChannelImage(
            channel.platform,
            channel.channelName,
            channel.channelId
          )
        )
      );

      // Small delay between batches
      if (i + BATCH_SIZE < channels.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    this.preloadComplete = true;
    this.logger.info("ChannelImagePreloaderService", "Preload complete");
  }

  /**
   * Check if preloading is complete
   */
  isPreloadComplete(): boolean {
    return this.preloadComplete;
  }

  /**
   * Reset preload state (useful for testing or manual refresh)
   */
  reset(): void {
    this.preloadComplete = false;
  }
}
