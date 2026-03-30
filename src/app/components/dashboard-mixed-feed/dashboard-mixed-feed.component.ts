/* sys lib */
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";

/* models */
import { ChatChannel } from "@models/chat.model";

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { buildChannelRef } from "@utils/channel-ref.util";

/* components */
import { ChatHistoryHeaderComponent } from "@components/chat-history-header/chat-history-header.component";
import { ChatMessageCardComponent } from "@components/chat-message-card/chat-message-card.component";
import { ChatScrollRegionComponent } from "@components/chat-scroll-region/chat-scroll-region.component";
import { ConnectionErrorBannerComponent } from "@components/connection-error-banner/connection-error-banner.component";

@Component({
  selector: "app-dashboard-mixed-feed",
  standalone: true,
  host: {
    class: "flex h-full min-w-0 flex-1 flex-col overflow-hidden",
  },
  imports: [
    DragDropModule,
    ChatScrollRegionComponent,
    ChatMessageCardComponent,
    ChatHistoryHeaderComponent,
    ConnectionErrorBannerComponent,
  ],
  templateUrl: "./dashboard-mixed-feed.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardMixedFeedComponent {
  readonly feedData = inject(DashboardFeedDataService);
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly interactions = inject(DashboardChatInteractionService);
  readonly connectionStateService = inject(ConnectionStateService);
  private readonly dashboardPreferences = inject(DashboardPreferencesService);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly chatStorage = inject(ChatStorageService);
  private readonly avatarCache = inject(AvatarCacheService);
  private readonly localStorageService = inject(LocalStorageService);

  // Reference to the history header component
  readonly historyHeader = viewChild<
    HTMLElement & { setLoadingComplete(success: boolean, hasMore: boolean): void }
  >("historyHeader");

  readonly disabledChannels = computed(() => {
    const saved = this.dashboardPreferences.preferences().mixedDisabledChannelIds;
    const visible = new Set(
      this.chatListService.getVisibleChannels().map((c) => this.channelRefFor(c))
    );
    // Only keep disabled IDs that still exist in visible channels
    return new Set(saved.filter((id) => visible.has(id)));
  });

  private readonly mixedChannelOrderStorageKey = "unichat-mixed-channel-order";
  readonly channelOrder = signal<string[]>(this.hydrateMixedOrder());
  readonly orderedVisibleChannels = computed(() => this.orderVisibleChannels());
  readonly orderedVisibleChannelIds = computed(() =>
    this.orderedVisibleChannels()
      .map((channel) => channel.id)
      .filter((id) => typeof id === "string" && id.trim().length > 0)
  );
  private isDragging = false;
  private suppressNextClick = false;

  readonly enabledVisibleChannels = computed(() =>
    this.orderedVisibleChannels().filter(
      (ch) => !this.disabledChannels().has(this.channelRefFor(ch))
    )
  );
  readonly mixedMessages = this.feedData.mixedFeedChronological;
  readonly visibleChannelCount = computed(() => this.chatListService.getVisibleChannels().length);

  private persistMixedDisabled(): void {
    const visible = new Set(
      this.chatListService.getVisibleChannels().map((c) => this.channelRefFor(c))
    );
    const current = this.disabledChannels();

    // Prune any disabled IDs that no longer exist in visible channels
    const pruned = new Set([...current].filter((id) => visible.has(id)));

    // Persist the pruned list to preferences
    this.dashboardPreferences.setMixedDisabledChannelIds([...pruned]);
  }

  private hydrateMixedOrder(): string[] {
    const stored = this.localStorageService.get<string[]>(this.mixedChannelOrderStorageKey, []);
    if (!Array.isArray(stored) || stored.length === 0) {
      return [];
    }

    const visibleIds = new Set(this.chatListService.getVisibleChannels().map((c) => c.id));
    return stored.filter((id) => visibleIds.has(id));
  }

  private persistMixedOrder(ids: string[]): void {
    this.localStorageService.set(this.mixedChannelOrderStorageKey, ids);
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

  toggleChannelFilter(channelRef: string): void {
    // CDK can emit a click after drag ends; prevent toggling filter in that case.
    if (this.isDragging || this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    const current = this.disabledChannels();
    const isDisabling = !current.has(channelRef);

    if (isDisabling) {
      // Disable channel: add to dashboard disabled and remove from overlays
      this.dashboardPreferences.addMixedDisabledChannelId(channelRef);
      this.removeChannelFromAllOverlays(channelRef);
    } else {
      // Enable channel: remove from dashboard disabled
      this.dashboardPreferences.removeMixedDisabledChannelId(channelRef);
    }
  }

  private removeChannelFromAllOverlays(channelRef: string): void {
    // Get all widgets from dashboard state
    const widgets = this.dashboardState.widgets();

    for (const widget of widgets) {
      const storageKey = `unichat-overlay-channel-ids:${widget.id}`;
      const stored = this.localStorageService.get<string[] | null>(storageKey, null);

      if (stored && Array.isArray(stored)) {
        // Filter out the disabled channel
        const filtered = stored.filter((id) => id !== channelRef);

        if (filtered.length === 0) {
          // If no channels left, remove the key (undefined = all channels)
          this.localStorageService.remove(storageKey);
        } else {
          this.localStorageService.set(storageKey, filtered);
        }
      }
    }

    // Also update the featured widget if it exists
    const featuredWidget = this.dashboardState.featuredWidget();
    if (featuredWidget) {
      const storageKey = `unichat-overlay-channel-ids:${featuredWidget.id}`;
      const stored = this.localStorageService.get<string[] | null>(storageKey, null);

      if (stored && Array.isArray(stored)) {
        const filtered = stored.filter((id) => id !== channelRef);

        if (filtered.length === 0) {
          this.localStorageService.remove(storageKey);
        } else {
          this.localStorageService.set(storageKey, filtered);
        }
      }
    }
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

  isChannelDisabled(channelRef: string): boolean {
    return this.disabledChannels().has(channelRef);
  }

  enableAllChannels(): void {
    // Enable all channels: clear dashboard disabled list
    this.dashboardPreferences.setMixedDisabledChannelIds([]);
    // When enabling all channels, do NOT auto-enable in overlay (keep overlay selection explicit)
  }

  disableAllChannels(): void {
    const channels = this.chatListService.getVisibleChannels();
    const allChannelRefs = channels.map((ch) => this.channelRefFor(ch));
    // Disable all channels: add all to dashboard disabled and remove from overlays
    this.dashboardPreferences.setMixedDisabledChannelIds(allChannelRefs);
    for (const channelRef of allChannelRefs) {
      this.removeChannelFromAllOverlays(channelRef);
    }
  }

  channelRefFor(channel: ChatChannel): string {
    return buildChannelRef(channel.platform, channel.channelId);
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
