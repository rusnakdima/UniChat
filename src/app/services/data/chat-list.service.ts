/* sys lib */
import { Injectable, inject, signal, Injector } from "@angular/core";

/* models */
import { ChannelAccountCapabilities, ChatChannel, PlatformType } from "@models/chat.model";

/* services */
import { ChannelImageLoaderService } from "@services/ui/channel-image-loader.service";
import { AvatarCacheService } from "@services/core/avatar-cache.service";

/* helpers */
import { normalizeYouTubeProviderInput, generateTimestamp } from "@shared/utils/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import { LocalStorageService } from "../core/local-storage.service";
import { DashboardPreferencesService } from "../ui/dashboard-preferences.service";

/**
 * Channel list is stored between sessions using localStorage.
 */
const storageKey = "unichat-chat-channels";
const OVERLAY_CHANNEL_IDS_PATTERN = /^unichat-overlay-channel-ids:/;

@Injectable({
  providedIn: "root",
})
export class ChatListService {
  private readonly localStorageService = inject(LocalStorageService);
  private readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  private readonly injector = inject(Injector);
  private readonly avatarCache = inject(AvatarCacheService);

  private _channelImageLoaderCache: ChannelImageLoaderService | null = null;

  private get channelImageLoader(): ChannelImageLoaderService {
    if (!this._channelImageLoaderCache) {
      this._channelImageLoaderCache = this.injector.get(ChannelImageLoaderService);
    }
    return this._channelImageLoaderCache;
  }

  private readonly channelsSignal = signal<ChatChannel[]>(this.loadChannels());

  readonly channels = this.channelsSignal.asReadonly();

  constructor() {
    queueMicrotask(() => this.loadMissingChannelImages());
  }

  private loadMissingChannelImages(): void {
    const channels = this.channelsSignal();
    for (const channel of channels) {
      const cacheKey = `${channel.platform}:${channel.id}`;
      if (!this.avatarCache.hasChannelAvatar(cacheKey)) {
        this.loadChannelImage(channel.id);
      }
    }
  }

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
      id: buildChannelRef(platform, providerChannelId),
      platform,
      channelId: providerChannelId,
      channelName: normalizedChannelName,
      isAuthorized: !!accountId,
      accountId,
      accountCapabilities: accountId
        ? this.createInitialAccountCapabilities(platform, normalizedChannelName, accountUsername)
        : undefined,
      isVisible: true,
      addedAt: generateTimestamp(),
    };

    this.channelsSignal.update((channels) => {
      const next = [...channels, newChannel];
      this.saveChannels(next);
      return next;
    });

    this.loadChannelImage(newChannel.id);
  }

  removeChannel(channelId: string): void {
    const channel = this.channelsSignal().find((ch) => ch.id === channelId);

    this.channelsSignal.update((channels) => {
      const next = channels.filter((ch) => ch.id !== channelId);
      this.saveChannels(next);
      return next;
    });

    if (channel) {
      const channelRef = buildChannelRef(channel.platform, channel.channelId);
      this.removeEnabledFromDashboard(channelRef);
      this.removeEnabledFromAllOverlays(channelRef);
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
      const channelRef = buildChannelRef(channel.platform, channel.channelId);
      this.removeEnabledFromDashboard(channelRef);
      this.removeEnabledFromAllOverlays(channelRef);
    }
  }

  private removeEnabledFromDashboard(channelRef: string): void {
    const mixedEnabled = this.dashboardPreferencesService.getMixedEnabledChannelIds();
    const filtered = mixedEnabled.filter((id: string) => id !== channelRef);
    this.dashboardPreferencesService.setMixedEnabledChannelIds(filtered);
  }

  private removeEnabledFromAllOverlays(channelRef: string): void {
    this.iterateOverlayStorageKeys((key) => {
      const stored = this.localStorageService.get<string[] | null>(key, null);
      if (stored && Array.isArray(stored)) {
        const filtered = stored.filter((id) => id !== channelRef);
        if (filtered.length === 0) {
          this.localStorageService.remove(key);
        } else {
          this.localStorageService.set(key, filtered);
        }
      }
    });
  }

  private iterateOverlayStorageKeys(callback: (key: string) => void): void {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && OVERLAY_CHANNEL_IDS_PATTERN.test(key)) {
        callback(key);
      }
    }
  }

  updateChannelName(channelId: string, newName: string): void {
    let shouldReloadImage = false;

    this.channelsSignal.update((channels) => {
      const next = channels.map((ch) => {
        if (ch.id !== channelId) {
          return ch;
        }

        shouldReloadImage = true;

        return {
          ...ch,
          channelName: newName,
          channelId: this.resolveProviderChannelId(ch.platform, newName),
          accountCapabilities: ch.accountId
            ? this.createInitialAccountCapabilities(ch.platform, newName)
            : ch.accountCapabilities,
        };
      });

      this.saveChannels(next);
      return next;
    });

    if (shouldReloadImage) {
      void this.loadChannelImage(channelId);
    }
  }

  updateChannelAccount(channelId: string, accountId?: string, accountUsername?: string): void {
    const channel = this.channelsSignal().find((ch) => ch.id === channelId);
    const needsImageLoad =
      channel && !this.avatarCache.hasChannelAvatar(`${channel.platform}:${channel.id}`);

    this.channelsSignal.update((channels) => {
      const next = channels.map((channel) => {
        if (channel.id !== channelId) {
          return channel;
        }

        return {
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
        };
      });

      this.saveChannels(next);
      return next;
    });

    if (needsImageLoad) {
      void this.loadChannelImage(channelId);
    }
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

  async loadChannelImage(channelId: string): Promise<void> {
    const channel = this.channelsSignal().find((ch) => ch.id === channelId);
    if (!channel) return;

    const cacheKey = `${channel.platform}:${channel.channelId}`;
    if (this.avatarCache.hasChannelAvatar(cacheKey)) {
      return;
    }

    await this.channelImageLoader.loadChannelImage(
      channel.platform,
      channel.channelName,
      channel.channelId
    );
  }

  private loadChannels(): ChatChannel[] {
    const stored = this.localStorageService.get<ChatChannel[]>(storageKey, []);
    return Array.isArray(stored) ? stored : [];
  }

  private saveChannels(channels: ChatChannel[]): void {
    this.localStorageService.set(storageKey, channels);
  }

  private resolveProviderChannelId(platform: PlatformType, channelName: string): string {
    return normalizeChannelId(platform, channelName);
  }

  private createInitialAccountCapabilities(
    platform: PlatformType,
    channelName: string,
    accountUsername?: string
  ): ChannelAccountCapabilities {
    const normalizedChannel = normalizeChannelId(platform, channelName);
    const normalizedAccount = accountUsername
      ? normalizeChannelId(platform, accountUsername)
      : undefined;
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
