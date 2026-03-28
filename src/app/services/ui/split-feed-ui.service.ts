/* sys lib */
import { Injectable, signal } from "@angular/core";

/* models */
import { ChatChannel, PlatformType } from "@models/chat.model";
@Injectable({
  providedIn: "root",
})
export class SplitFeedUiService {
  readonly activeChannelIdByPlatform = signal<Partial<Record<PlatformType, string>>>({});

  setActiveChannel(platform: PlatformType, channelId: string): void {
    this.activeChannelIdByPlatform.update((m) => ({ ...m, [platform]: channelId }));
  }

  activeChannelId(platform: PlatformType): string | undefined {
    return this.activeChannelIdByPlatform()[platform];
  }

  ensureActiveChannel(platform: PlatformType, channels: ChatChannel[]): void {
    if (channels.length === 0) {
      return;
    }
    const current = this.activeChannelIdByPlatform()[platform];
    if (!current || !channels.some((c) => c.channelId === current)) {
      this.setActiveChannel(platform, channels[0].channelId);
    }
  }
}
