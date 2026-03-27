import { Injectable, computed, inject } from "@angular/core";
import { ChatChannel, ChatMessage, PlatformType } from "@models/chat.model";
import {
  buildSplitFeed,
  groupChannelsByPlatform,
  sortMessagesChronological,
} from "@helpers/chat.helper";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateService } from "@services/data/chat-state.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";

@Injectable({
  providedIn: "root",
})
export class DashboardFeedDataService {
  private readonly chatListService = inject(ChatListService);
  private readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly chatStorageService = inject(ChatStorageService);

  readonly orderedPlatforms = computed(
    () => this.dashboardPreferencesService.preferences().splitLayout.orderedPlatforms
  );

  /**
   * All visible channels from settings (used for connection and split feed).
   * Mixed feed filtering is done separately in getMixedFeedChronological().
   */
  readonly allVisibleChannels = computed(() => {
    return this.chatListService.getVisibleChannels();
  });

  /**
   * Channels filtered for mixed feed (excludes disabled channels).
   * mixedDisabledChannelIds stores which channels are toggled off in mixed feed.
   */
  readonly mixedFeedChannels = computed(() => {
    const visible = this.chatListService.getVisibleChannels();
    const disabled = new Set(
      this.dashboardPreferencesService.preferences().mixedDisabledChannelIds
    );
    if (disabled.size === 0) {
      return visible;
    }
    return visible.filter((ch) => !disabled.has(ch.id));
  });

  readonly channelsByPlatform = computed(() => groupChannelsByPlatform(this.allVisibleChannels()));

  readonly mixedFeedProviderChannelIdsByPlatform = computed(() => {
    const byPlatform = this.channelsByPlatform();
    const disabled = new Set(
      this.dashboardPreferencesService.preferences().mixedDisabledChannelIds
    );

    // Filter out disabled channels per platform
    const filterDisabled = (channels: ChatChannel[]) =>
      new Set(channels.filter((c) => !disabled.has(c.id)).map((c) => c.channelId));

    return {
      twitch: filterDisabled(byPlatform.twitch),
      kick: filterDisabled(byPlatform.kick),
      youtube: filterDisabled(byPlatform.youtube),
    } as Record<PlatformType, Set<string>>;
  });

  readonly visiblePlatformsInOrder = computed(() => {
    const ordered = this.orderedPlatforms();
    const byPlatform = this.channelsByPlatform();
    return ordered.filter((p) => (byPlatform[p]?.length ?? 0) > 0);
  });

  /** Check if platform has any visible (non-hidden) channels */
  hasVisibleChannels(platform: PlatformType): boolean {
    return (this.channelsByPlatform()[platform]?.length ?? 0) > 0;
  }

  /** Get platforms that have visible channels */
  readonly platformsWithVisibleChannels = computed(() => {
    const ordered = this.orderedPlatforms();
    const byPlatform = this.channelsByPlatform();
    return ordered.filter((p) => (byPlatform[p]?.length ?? 0) > 0);
  });

  readonly splitFeed = computed(() => {
    const messages = this.chatStateService.messages();
    return buildSplitFeed(messages);
  });

  orderedChannelsForPlatform(platform: PlatformType): ChatChannel[] {
    this.dashboardPreferencesService.preferences();
    const visible = this.channelsByPlatform()[platform] ?? [];
    const savedOrder =
      this.dashboardPreferencesService.preferences().splitLayout.orderedChannelIds?.[platform];
    return DashboardFeedDataService.mergeChannelOrder(visible, savedOrder);
  }

  private static mergeChannelOrder(
    visible: ChatChannel[],
    savedOrder: string[] | undefined
  ): ChatChannel[] {
    if (!savedOrder?.length) {
      return visible;
    }
    const byChannelId = new Map(visible.map((c) => [c.channelId, c]));
    const out: ChatChannel[] = [];
    const used = new Set<string>();
    for (const id of savedOrder) {
      const ch = byChannelId.get(id);
      if (ch) {
        out.push(ch);
        used.add(ch.channelId);
      }
    }
    for (const ch of visible) {
      if (!used.has(ch.channelId)) {
        out.push(ch);
      }
    }
    return out;
  }

  getMessagesForChannel(platform: PlatformType, channelId: string): ChatMessage[] {
    // For split feed, show all channels (no mixed filter)
    // Only return messages if channel is loaded (lazy loading)
    if (!this.chatStorageService.isChannelLoaded(channelId)) {
      return [];
    }
    const list = this.splitFeed()[platform].filter(
      (message) => message.sourceChannelId === channelId
    );
    return sortMessagesChronological(list);
  }

  loadChannelMessages(platform: PlatformType, channelId: string): void {
    if (this.chatStorageService.isChannelLoaded(channelId)) {
      return; // Already loaded
    }
    this.chatStorageService.markChannelAsLoaded(channelId);
  }

  scrollTokenForChannel(platform: PlatformType, channelId: string): string {
    const msgs = this.splitFeed()[platform].filter(
      (message) => message.sourceChannelId === channelId
    );
    const newest = msgs.length > 0 ? msgs[0] : undefined;
    return `${platform}:${channelId}:${msgs.length}:${newest?.id ?? ""}`;
  }

  private mixedMessagesRaw(): ChatMessage[] {
    const messages = this.chatStateService.messages();
    const idsByPlatform = this.mixedFeedProviderChannelIdsByPlatform();
    return messages.filter((m) => idsByPlatform[m.platform].has(m.sourceChannelId));
  }

  getMixedFeedChronological(): ChatMessage[] {
    return sortMessagesChronological(this.mixedMessagesRaw());
  }

  mixedScrollToken(): string {
    const raw = this.mixedMessagesRaw();
    const newest = raw.length > 0 ? raw[0] : undefined;
    return `mixed:${raw.length}:${newest?.id ?? ""}`;
  }
}
