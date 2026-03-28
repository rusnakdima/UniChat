/* sys lib */
import { Injectable, signal } from "@angular/core";

/* models */
import { ChannelAccountCapabilities, ChatChannel, PlatformType } from "@models/chat.model";

/* helpers */
import { normalizeYouTubeProviderInput } from "@helpers/chat.helper";
const storageKey = "unichat-chat-channels";
const legacyMockIds = new Set(["ch-twitch-1", "ch-twitch-2", "ch-kick-1", "ch-youtube-1"]);

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

  /** Display name for a provider channel row (mixed feed labels, etc.). */
  getChannelDisplayName(platform: PlatformType, providerChannelId: string): string {
    const match = this.getChannels(platform).find((ch) => ch.channelId === providerChannelId);
    return match?.channelName?.trim() || providerChannelId;
  }

  addChannel(
    platform: PlatformType,
    channelName: string,
    channelId?: string,
    accountId?: string,
    accountUsername?: string
  ): void {
    const normalizedChannelName = channelName.trim();
    if (!normalizedChannelName) {
      return;
    }

    const providerChannelId =
      channelId?.trim() || this.resolveProviderChannelId(platform, normalizedChannelName);
    if (!providerChannelId) {
      return;
    }

    const exists = this.channelsSignal().some(
      (channel) =>
        channel.platform === platform &&
        (channel.channelId === providerChannelId ||
          channel.channelName.toLowerCase() === normalizedChannelName.toLowerCase())
    );
    if (exists) {
      return;
    }

    const newChannel: ChatChannel = {
      id: `ch-${platform}-${Date.now()}`,
      platform,
      channelId: providerChannelId,
      channelName: normalizedChannelName,
      isAuthorized: !!accountId,
      accountId,
      accountCapabilities: accountId
        ? this.createInitialAccountCapabilities(platform, normalizedChannelName, accountUsername)
        : undefined,
      isVisible: true,
      addedAt: new Date().toISOString(),
    };

    this.channelsSignal.update((channels) => {
      const next = [...channels, newChannel];
      this.saveChannels(next);
      return next;
    });
  }

  removeChannel(channelId: string): void {
    this.channelsSignal.update((channels) => {
      const next = channels.filter((ch) => ch.id !== channelId);
      this.saveChannels(next);
      return next;
    });
  }

  toggleChannelVisibility(channelId: string): void {
    this.channelsSignal.update((channels) => {
      const next = channels.map((ch) =>
        ch.id === channelId ? { ...ch, isVisible: !ch.isVisible } : ch
      );
      this.saveChannels(next);
      return next;
    });
  }

  updateChannelName(channelId: string, newName: string): void {
    this.channelsSignal.update((channels) => {
      const next = channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              channelName: newName,
              channelId: this.resolveProviderChannelId(ch.platform, newName),
              accountCapabilities: ch.accountId
                ? this.createInitialAccountCapabilities(ch.platform, newName)
                : ch.accountCapabilities,
            }
          : ch
      );
      this.saveChannels(next);
      return next;
    });
  }

  updateChannelAccount(channelId: string, accountId?: string, accountUsername?: string): void {
    this.channelsSignal.update((channels) => {
      const next = channels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              accountId,
              isAuthorized: !!accountId,
              accountCapabilities: accountId
                ? this.createInitialAccountCapabilities(
                    channel.platform,
                    channel.channelName,
                    accountUsername
                  )
                : undefined,
            }
          : channel
      );
      this.saveChannels(next);
      return next;
    });
  }

  updateChannelCapabilities(
    channelId: string,
    accountCapabilities: ChannelAccountCapabilities | undefined
  ): void {
    this.channelsSignal.update((channels) => {
      const next = channels.map((channel) =>
        channel.id === channelId ? { ...channel, accountCapabilities } : channel
      );
      this.saveChannels(next);
      return next;
    });
  }

  private loadChannels(): ChatChannel[] {
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as ChatChannel[];
      return parsed
        .filter((channel) => !legacyMockIds.has(channel.id))
        .map((channel) =>
          channel.platform === "youtube"
            ? {
                ...channel,
                channelId: normalizeYouTubeProviderInput(channel.channelId || channel.channelName),
              }
            : channel
        )
        .filter((channel) => !!channel.channelId);
    } catch {
      return [];
    }
  }

  private saveChannels(channels: ChatChannel[]): void {
    localStorage.setItem(storageKey, JSON.stringify(channels));
  }

  private resolveProviderChannelId(platform: PlatformType, channelName: string): string {
    switch (platform) {
      case "twitch":
      case "kick":
        return channelName.replace(/^#/, "").toLowerCase();
      case "youtube":
        return normalizeYouTubeProviderInput(channelName);
    }
  }

  private createInitialAccountCapabilities(
    platform: PlatformType,
    channelName: string,
    accountUsername?: string
  ): ChannelAccountCapabilities {
    const normalizedChannel = channelName.trim().toLowerCase();
    const normalizedAccount = accountUsername?.trim().toLowerCase();
    const isVerifiedOwner =
      platform === "twitch" && !!normalizedAccount && normalizedAccount === normalizedChannel;

    return {
      canListen: true,
      canReply: true,
      canDelete: isVerifiedOwner,
      canModerate: isVerifiedOwner,
      moderationRole: isVerifiedOwner ? "owner" : "viewer",
      verified: isVerifiedOwner,
    };
  }
}
