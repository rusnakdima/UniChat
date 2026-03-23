import { Injectable, signal } from "@angular/core";
import { ChatChannel, PlatformType } from "@models/chat.model";
import { mockChannels } from "@views/dashboard-view/dashboard.mock";

const storageKey = "unichat-chat-channels";

@Injectable({
  providedIn: "root",
})
export class ChatListService {
  private readonly channelsSignal = signal<ChatChannel[]>(this.loadChannels());

  readonly channels = this.channelsSignal.asReadonly();

  getChannels(platform?: PlatformType): ChatChannel[] {
    const allChannels = this.channelsSignal();
    return platform ? allChannels.filter((ch) => ch.platform === platform) : allChannels;
  }

  getVisibleChannels(platform?: PlatformType): ChatChannel[] {
    return this.getChannels(platform).filter((ch) => ch.isVisible);
  }

  addChannel(
    platform: PlatformType,
    channelName: string,
    channelId?: string,
    accountId?: string
  ): void {
    const newChannel: ChatChannel = {
      id: `ch-${platform}-${Date.now()}`,
      platform,
      channelId: channelId ?? `${platform}-ch-${Date.now()}`,
      channelName,
      isAuthorized: !!accountId,
      accountId,
      isVisible: true,
      addedAt: new Date().toISOString(),
    };

    this.channelsSignal.update((channels) => [...channels, newChannel]);
  }

  removeChannel(channelId: string): void {
    this.channelsSignal.update((channels) => channels.filter((ch) => ch.id !== channelId));
  }

  toggleChannelVisibility(channelId: string): void {
    this.channelsSignal.update((channels) =>
      channels.map((ch) => (ch.id === channelId ? { ...ch, isVisible: !ch.isVisible } : ch))
    );
  }

  private loadChannels(): ChatChannel[] {
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return mockChannels;
    }

    try {
      const parsed = JSON.parse(stored) as ChatChannel[];
      return parsed;
    } catch {
      return mockChannels;
    }
  }
}
