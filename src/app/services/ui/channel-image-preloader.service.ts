import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ChannelImagePreloaderService {
  preload(channelRefs: string[]): void {}
  clearCache(): void {}

  preloadAllVisibleChannels(): void {}
}
