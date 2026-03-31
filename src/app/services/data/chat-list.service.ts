/* sys lib */
import { Injectable, signal } from "@angular/core";

/* models */
import { ChannelAccountCapabilities, ChatChannel, PlatformType } from "@models/chat.model";

/* helpers */
import { normalizeYouTubeProviderInput } from "@helpers/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";
import { LocalStorageService } from "../core/local-storage.service";
import { DashboardPreferencesService } from "../ui/dashboard-preferences.service";
const storageKey = "unichat-chat-channels";

@Injectable({
  providedIn: "root",
})
export class ChatListService {
  private readonly channelsSignal = signal<ChatChannel[]>(this.loadChannels());

  readonly channels = this.channelsSignal.asReadonly();

  constructor(
    private readonly localStorageService: LocalStorageService,
    private readonly dashboardPreferencesService: DashboardPreferencesService
  ) {}

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
    const channel = this.channelsSignal().find((ch) => ch.id === channelId);

    this.channelsSignal.update((channels) => {
      const next = channels.filter((ch) => ch.id !== channelId);
      this.saveChannels(next);
      return next;
    });

    // Clean up: remove from mixedDisabledChannelIds and overlay configs
    if (channel) {
      const channelRef = buildChannelRef(channel.platform, channel.channelId);
      this.removeFromMixedDisabled(channelRef);
      this.removeChannelFromAllOverlays(channelRef);
    }
  }

  toggleChannelVisibility(channelId: string): void {
    const channel = this.channelsSignal().find((ch) => ch.id === channelId);
    const willBeHidden = !(channel?.isVisible ?? true);

    this.channelsSignal.update((channels) => {
      const next = channels.map((ch) =>
        ch.id === channelId ? { ...ch, isVisible: !ch.isVisible } : ch
      );
      this.saveChannels(next);
      return next;
    });

    if (willBeHidden && channel) {
      // When hiding a channel: add to mixedDisabledChannelIds and remove from overlay configs
      // Channel remains visible in UI but is disabled
      const channelRef = buildChannelRef(channel.platform, channel.channelId);
      this.addToMixedDisabledAndRemoveFromOverlays(channelRef);
    } else if (channel) {
      // When showing a channel: remove from mixedDisabledChannelIds
      // Channel becomes enabled in dashboard and overlay
      const channelRef = buildChannelRef(channel.platform, channel.channelId);
      this.removeFromMixedDisabled(channelRef);
    }
  }

  private addToMixedDisabledAndRemoveFromOverlays(channelRef: string): void {
    // Add to mixedDisabledChannelIds (disables in dashboard)
    this.dashboardPreferencesService.addMixedDisabledChannelId(channelRef);

    // Remove from all overlay configurations (disables in overlay management)
    this.removeChannelFromAllOverlays(channelRef);
  }

  private removeFromMixedDisabled(channelRef: string): void {
    // Remove from mixedDisabledChannelIds (enables in dashboard)
    const mixedDisabled = this.dashboardPreferencesService.getMixedDisabledChannelIds();
    const filtered = mixedDisabled.filter((id: string) => id !== channelRef);
    this.dashboardPreferencesService.setMixedDisabledChannelIds(filtered);
  }

  private removeChannelFromAllOverlays(channelRef: string): void {
    // Iterate through all localStorage keys to find overlay channel configurations
    // Pattern: unichat-overlay-channel-ids:{widgetId}
    const overlayChannelIdsPattern = /^unichat-overlay-channel-ids:/;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && overlayChannelIdsPattern.test(key)) {
        const stored = this.localStorageService.get<string[] | null>(key, null);
        if (stored && Array.isArray(stored)) {
          const filtered = stored.filter((id) => id !== channelRef);
          if (filtered.length === 0) {
            this.localStorageService.remove(key);
          } else {
            this.localStorageService.set(key, filtered);
          }
        }
      }
    }
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
      let needsSave = false;

      const migrated = parsed
        .map((channel) => {
          // Migrate YouTube channels
          if (channel.platform === "youtube") {
            const normalizedChannelId = normalizeYouTubeProviderInput(
              channel.channelId || channel.channelName
            );
            if (normalizedChannelId !== channel.channelId) {
              channel.channelId = normalizedChannelId;
              needsSave = true;
            }
          }
          return channel;
        })
        .filter((channel) => !!channel.channelId);

      if (needsSave) {
        this.saveChannels(migrated);
      }

      return migrated;
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
