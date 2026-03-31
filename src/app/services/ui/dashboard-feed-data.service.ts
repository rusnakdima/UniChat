/* sys lib */
import { Injectable, computed, inject, signal } from "@angular/core";

/* models */
import { ChatChannel, ChatMessage, PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";

/* helpers */
import { groupChannelsByPlatform, sortMessagesChronological } from "@helpers/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";
@Injectable({
  providedIn: "root",
})
export class DashboardFeedDataService {
  private readonly chatListService = inject(ChatListService);
  private readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  private readonly chatStorageService = inject(ChatStorageService);

  // Signal that updates whenever channel messages change
  // Components can read this to force dependency on message updates
  readonly messageVersion = computed(() => {
    // Reading channelMessages creates dependency
    const messages = this.chatStorageService.channelMessages();
    // Return a version based on message count to trigger updates
    let total = 0;
    for (const msgs of Object.values(messages)) {
      total += msgs.length;
    }
    return total;
  });

  readonly orderedPlatforms = computed(
    () => this.dashboardPreferencesService.preferences().splitLayout.orderedPlatforms
  );

  /**
   * All visible channels from settings (used for connection and split feed).
   * Mixed feed filtering is handled separately in `mixedFeedChronological`.
   */
  readonly allVisibleChannels = computed(() => {
    return this.chatListService.getVisibleChannels();
  });

  /**
   * Channels filtered for mixed feed (only includes enabled channels).
   * mixedEnabledChannelIds stores which channels are toggled on in mixed feed.
   */
  readonly mixedFeedChannels = computed(() => {
    const visible = this.chatListService.getVisibleChannels();
    const enabled = new Set(this.dashboardPreferencesService.preferences().mixedEnabledChannelIds);
    // If no enabled channels set, show none (user must manually enable)
    if (enabled.size === 0) {
      return [];
    }
    return visible.filter((ch) => enabled.has(buildChannelRef(ch.platform, ch.channelId)));
  });

  readonly channelsByPlatform = computed(() => groupChannelsByPlatform(this.allVisibleChannels()));

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
    // Only include platforms that have visible channels
    return ordered.filter((p) => (byPlatform[p]?.length ?? 0) > 0);
  });

  readonly channelMessagesChronologicalByRef = computed(() => {
    const messagesByChannel = this.chatStorageService.channelMessages();
    const chronological: Record<string, ChatMessage[]> = {};

    for (const [storageKey, messages] of Object.entries(messagesByChannel)) {
      if (messages.length === 0) {
        continue;
      }

      // Providers store messages with lowercase channel IDs.
      // Canonicalize everything to `platform:providerChannelId` (lowercase) so dashboard
      // selectors can resolve the same channel regardless of storage key shape.
      const firstMessage = messages[0];
      const normalizedChannelId = firstMessage.sourceChannelId?.toLowerCase() ?? "";
      const channelRef = buildChannelRef(firstMessage.platform, normalizedChannelId);
      const existing = chronological[channelRef] ?? [];
      chronological[channelRef] = [...existing, ...messages];

      // Keep an alias for already-canonical buckets so any future direct lookups
      // remain consistent while the rest of storage migrates.
      if (storageKey === channelRef) {
        chronological[storageKey] = chronological[channelRef];
      }
    }

    for (const [channelRef, messages] of Object.entries(chronological)) {
      chronological[channelRef] = sortMessagesChronological(messages);
    }

    return chronological;
  });

  readonly mixedFeedChronological = computed(() => {
    // Explicitly read computed signals to create dependency on their changes
    this.channelMessagesChronologicalByRef();
    this.chatStorageService.channelMessages();

    const chronologicalByRef = this.channelMessagesChronologicalByRef();
    // Normalize channelId to lowercase to match storage keys
    const refs = this.mixedFeedChannels().map((channel) =>
      buildChannelRef(channel.platform, channel.channelId.toLowerCase())
    );
    const messages: ChatMessage[] = [];

    for (const ref of refs) {
      const channelMessages = chronologicalByRef[ref];
      if (channelMessages?.length) {
        messages.push(...channelMessages);
      }
    }

    return sortMessagesChronological(messages);
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
    // Normalize channelId to lowercase for matching (providers store with lowercase keys)

    // Explicitly read computed signals to create dependency on their changes
    this.channelMessagesChronologicalByRef();
    this.chatStorageService.channelMessages();

    const normalizedChannelId = channelId.toLowerCase();
    const channelRef = buildChannelRef(platform, normalizedChannelId);
    const isLoaded = this.chatStorageService.isChannelLoaded(channelRef);
    if (!isLoaded) {
      return [];
    }
    return this.channelMessagesChronologicalByRef()[channelRef] ?? [];
  }

  loadChannelMessages(platform: PlatformType, channelId: string): void {
    // Normalize channelId to lowercase to match provider storage keys
    const normalizedChannelId = channelId.toLowerCase();
    const channelRef = buildChannelRef(platform, normalizedChannelId);
    if (this.chatStorageService.isChannelLoaded(channelRef)) {
      return; // Already loaded
    }
    this.chatStorageService.markChannelAsLoaded(channelRef);
  }

  scrollTokenForChannel(platform: PlatformType, channelId: string): string {
    return `${platform}:${channelId}`;
  }

  mixedScrollToken(): string {
    const channels = this.mixedFeedChannels()
      .map((channel) => buildChannelRef(channel.platform, channel.channelId))
      .join("|");
    return `mixed:${channels}`;
  }
}
