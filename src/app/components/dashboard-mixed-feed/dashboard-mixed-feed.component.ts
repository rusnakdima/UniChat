import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { ChatScrollRegionComponent } from "@components/chat-scroll-region/chat-scroll-region.component";
import { ChatMessageCardComponent } from "@components/chat-message-card/chat-message-card.component";
import { ChatHistoryHeaderComponent } from "@components/chat-history-header/chat-history-header.component";
import { ChatChannel } from "@models/chat.model";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { AvatarCacheService } from "@services/core/avatar-cache.service";

@Component({
  selector: "app-dashboard-mixed-feed",
  host: {
    class: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
  },
  imports: [
    DragDropModule,
    ChatScrollRegionComponent,
    ChatMessageCardComponent,
    ChatHistoryHeaderComponent,
  ],
  templateUrl: "./dashboard-mixed-feed.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardMixedFeedComponent {
  readonly feedData = inject(DashboardFeedDataService);
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly interactions = inject(DashboardChatInteractionService);
  private readonly dashboardPreferences = inject(DashboardPreferencesService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly chatStorage = inject(ChatStorageService);
  private readonly avatarCache = inject(AvatarCacheService);

  // Reference to the history header component
  readonly historyHeader = viewChild<
    HTMLElement & { setLoadingComplete(success: boolean, hasMore: boolean): void }
  >("historyHeader");

  readonly disabledChannels = signal<Set<string>>(this.hydrateDisabledFromPreferences());

  private readonly mixedChannelOrderStorageKey = "unichat-mixed-channel-order";
  readonly channelOrder = signal<string[]>(this.hydrateMixedOrder());
  readonly orderedVisibleChannels = computed(() => this.orderVisibleChannels());
  private isDragging = false;
  private suppressNextClick = false;

  readonly enabledVisibleChannels = computed(() =>
    this.orderedVisibleChannels().filter((ch) => !this.disabledChannels().has(ch.id))
  );

  private hydrateDisabledFromPreferences(): Set<string> {
    const saved = this.dashboardPreferences.preferences().mixedDisabledChannelIds;
    // Use channel.id (unique with platform) instead of channelId
    const visible = new Set(this.chatListService.getVisibleChannels().map((c) => c.id));

    // Only keep disabled IDs that still exist in visible channels
    // This ensures removed channels don't pollute the disabled state
    const pruned = saved.filter((id) => visible.has(id));

    // If the pruned list differs from saved, update preferences
    if (pruned.length !== saved.length) {
      this.dashboardPreferences.setMixedDisabledChannelIds(pruned);
    }

    return new Set(pruned);
  }

  private persistMixedDisabled(): void {
    // Use channel.id (unique with platform) instead of channelId
    const visible = new Set(this.chatListService.getVisibleChannels().map((c) => c.id));
    const current = this.disabledChannels();

    // Prune any disabled IDs that no longer exist in visible channels
    const pruned = new Set([...current].filter((id) => visible.has(id)));

    // Update signal if we pruned any IDs
    if (pruned.size !== current.size) {
      this.disabledChannels.set(pruned);
    }

    // Persist the pruned list to preferences
    this.dashboardPreferences.setMixedDisabledChannelIds([...pruned]);
  }

  private hydrateMixedOrder(): string[] {
    const stored = localStorage.getItem(this.mixedChannelOrderStorageKey);
    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as string[];
      const visibleIds = new Set(this.chatListService.getVisibleChannels().map((c) => c.id));
      return parsed.filter((id) => visibleIds.has(id));
    } catch {
      return [];
    }
  }

  private persistMixedOrder(ids: string[]): void {
    localStorage.setItem(this.mixedChannelOrderStorageKey, JSON.stringify(ids));
  }

  private orderVisibleChannels(): ChatChannel[] {
    const visible = this.chatListService.getVisibleChannels();
    const byId = new Map(visible.map((c) => [c.id, c]));
    const visibleIdSet = new Set(visible.map((c) => c.id));

    const orderedIds = this.channelOrder().filter((id) => visibleIdSet.has(id));
    const used = new Set<string>(orderedIds);
    const out: ChatChannel[] = [];

    for (const id of orderedIds) {
      const ch = byId.get(id);
      if (ch) {
        out.push(ch);
      }
    }

    for (const ch of visible) {
      if (!used.has(ch.id)) {
        out.push(ch);
      }
    }

    return out;
  }

  orderedVisibleChannelIds(): string[] {
    return this.orderedVisibleChannels()
      .map((c) => c.id)
      .filter((id) => typeof id === "string" && id.trim().length > 0);
  }

  enabledVisibleChannelIds(): string[] {
    return this.enabledVisibleChannels()
      .map((c) => c.id)
      .filter((id) => typeof id === "string" && id.trim().length > 0);
  }

  toggleChannelFilter(channelId: string): void {
    // CDK can emit a click after drag ends; prevent toggling filter in that case.
    if (this.isDragging || this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    this.disabledChannels.update((disabled) => {
      const next = new Set(disabled);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
    this.persistMixedDisabled();
  }

  onMixedChannelDragStarted(): void {
    this.isDragging = true;
  }

  onMixedChannelDragEnded(): void {
    this.isDragging = false;
    this.suppressNextClick = true;
  }

  onMixedChannelDrop(event: CdkDragDrop<string[]>): void {
    // `event.container.data` contains ALL channels (both enabled and disabled).
    // Simply update the order based on the drop result.
    const newOrder = [...event.container.data];
    moveItemInArray(newOrder, event.previousIndex, event.currentIndex);

    this.channelOrder.set(newOrder);
    this.persistMixedOrder(newOrder);
  }

  isChannelDisabled(channelId: string): boolean {
    return this.disabledChannels().has(channelId);
  }

  enableAllChannels(): void {
    this.disabledChannels.set(new Set());
    this.persistMixedDisabled();
  }

  disableAllChannels(): void {
    const channels = this.chatListService.getVisibleChannels();
    // Use channel.id (unique with platform) instead of channelId
    this.disabledChannels.set(new Set(channels.map((ch) => ch.id)));
    this.persistMixedDisabled();
  }

  /** Get channel profile image URL (loads on demand for Twitch) */
  async getChannelImageUrl(channel: ChatChannel): Promise<string | null> {
    // Check centralized cache first
    const cached = this.avatarCache.getChannelAvatar(channel.id);
    if (cached) {
      return cached;
    }

    if (channel.platform === "twitch") {
      try {
        const imageUrl = await this.twitchChat.fetchChannelProfileImage(channel.channelName);
        if (imageUrl) {
          this.avatarCache.setChannelAvatar(channel.id, imageUrl);
          return imageUrl;
        }
      } catch {
        // Ignore errors
      }
    }

    return null;
  }

  hasChannelImage(channel: ChatChannel): boolean {
    return this.avatarCache.hasChannelAvatar(channel.id);
  }

  getCachedChannelImage(channel: ChatChannel): string | null {
    return this.avatarCache.getChannelAvatar(channel.id) ?? null;
  }

  readonly loadChannelImage = (channel: ChatChannel): void => {
    if (!this.avatarCache.hasChannelAvatar(channel.id)) {
      void this.getChannelImageUrl(channel);
    }
  };

  async onLoadHistory(event: { channelId: string | undefined; count: number }): Promise<void> {
    // For mixed feed, load history for all enabled channels (channelId is ignored)
    const channels = this.enabledVisibleChannels();
    let totalLoaded = 0;

    for (const channel of channels) {
      // Only Twitch supports history loading via Robotty
      if (channel.platform === "twitch") {
        const messages = await this.twitchChat.loadChannelHistory(channel.channelId, event.count);

        if (messages.length > 0) {
          this.chatStorage.prependMessages(channel.channelId, messages);
          totalLoaded += messages.length;
        }
      }
    }

    const hasMore = totalLoaded >= event.count;
    // Notify the history header that loading is complete
    this.historyHeader()?.setLoadingComplete(true, hasMore);
  }

  /** Load history for a specific channel (called from split feed context) */
  async onLoadHistoryForChannel(channelId: string, platform: string, count: number): Promise<void> {
    // Only Twitch supports history loading via Robotty
    if (platform !== "twitch") {
      this.historyHeader()?.setLoadingComplete(true, false);
      return;
    }

    const messages = await this.twitchChat.loadChannelHistory(channelId, count);

    if (messages.length > 0) {
      this.chatStorage.prependMessages(channelId, messages);
    }

    this.historyHeader()?.setLoadingComplete(true, messages.length >= count);
  }
}
