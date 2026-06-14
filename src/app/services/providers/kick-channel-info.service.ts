import { inject } from "@angular/core";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { KickChannelInfo } from "@models/platform-api.model";
import { ReconnectionManager } from "@utils/reconnection-manager.util";
import { normalizeChannelId } from "@utils/channel-normalization.util";

export class KickChannelInfoService {
  private static readonly MAX_CHANNEL_INFO_CACHE = 50;
  private static readonly CHANNEL_INFO_TTL_MS = 30 * 60 * 1000;

  private readonly channelInfoByChannel = new Map<
    string,
    { info: KickChannelInfo; timestamp: number }
  >();

  private readonly logger = inject(LOGGER_SERVICE);

  getChannelInfo(channelSlug: string): KickChannelInfo | undefined {
    return this.channelInfoByChannel.get(channelSlug)?.info;
  }

  setChannelInfo(channelSlug: string, info: KickChannelInfo): void {
    this.channelInfoByChannel.set(channelSlug, { info, timestamp: Date.now() });
  }

  getCachedChannelInfo(channelSlug: string): KickChannelInfo | null {
    const cached = this.channelInfoByChannel.get(channelSlug);
    if (cached && Date.now() - cached.timestamp <= KickChannelInfoService.CHANNEL_INFO_TTL_MS) {
      return cached.info;
    }
    return null;
  }

  cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.channelInfoByChannel) {
      if (now - value.timestamp > KickChannelInfoService.CHANNEL_INFO_TTL_MS) {
        this.channelInfoByChannel.delete(key);
      }
    }
    if (this.channelInfoByChannel.size > KickChannelInfoService.MAX_CHANNEL_INFO_CACHE) {
      const entriesToDelete =
        this.channelInfoByChannel.size - KickChannelInfoService.MAX_CHANNEL_INFO_CACHE;
      const keysToDelete = Array.from(this.channelInfoByChannel.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.channelInfoByChannel.delete(key);
      }
    }
  }

  deleteChannelInfo(channelSlug: string): void {
    this.channelInfoByChannel.delete(channelSlug);
  }
}
