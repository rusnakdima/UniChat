/* sys lib */
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { ChatChannel } from "@models/chat.model";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateService } from "@services/data/chat-state.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChannelAvatarService } from "@services/ui/channel-avatar.service";
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
    MatIconModule,
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
  readonly channelAvatars = inject(ChannelAvatarService);
  private readonly dashboardPreferences = inject(DashboardPreferencesService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly chatStorage = inject(ChatStorageService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly cdr = inject(ChangeDetectorRef);

  // Reference to the history header component
  readonly historyHeader = viewChild<
    HTMLElement & { setLoadingComplete(success: boolean, hasMore: boolean): void }
  >("historyHeader");

  readonly enabledChannels = computed(() => {
    const saved = this.dashboardPreferences.preferences().mixedEnabledChannelIds;
    // Only check against visible channels (channels enabled in settings)
    const visible = new Set(
      this.chatListService
        .channels()
        .filter((ch) => ch.isVisible)
        .map((c) => this.channelRefFor(c))
    );
    // Only keep enabled IDs that still exist in visible channels
    return new Set(saved.filter((id) => visible.has(id)));
  });

  readonly showFilterDropdown = signal(false);
  readonly activeFilterChannelIds = computed(() => this.enabledChannels());

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
    this.orderedVisibleChannels().filter((ch) => this.enabledChannels().has(this.channelRefFor(ch)))
  );
  readonly mixedMessages = this.feedData.mixedFeedChronological;
  readonly visibleChannelCount = computed(
    () => this.chatListService.channels().filter((ch) => ch.isVisible).length
  );

  constructor() {
    effect(() => {
      for (const channel of this.orderedVisibleChannels()) {
        this.channelAvatars.ensureChannelImageForChannel(channel);
      }
    });
  }

  private hydrateMixedOrder(): string[] {
    const stored = this.localStorageService.get<string[]>(this.mixedChannelOrderStorageKey, []);
    if (!Array.isArray(stored) || stored.length === 0) {
      return [];
    }

    // Only keep order for visible channels (channels enabled in settings)
    const visibleIds = new Set(
      this.chatListService
        .channels()
        .filter((ch) => ch.isVisible)
        .map((c) => c.id)
    );
    return stored.filter((id) => visibleIds.has(id));
  }

  private persistMixedOrder(ids: string[]): void {
    this.localStorageService.set(this.mixedChannelOrderStorageKey, ids);
  }

  private orderVisibleChannels(): ChatChannel[] {
    // Only show channels that are visible in settings (isVisible === true)
    const visible = this.chatListService.channels().filter((ch) => ch.isVisible);
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
    const current = this.enabledChannels();
    const isEnabled = current.has(channelRef);

    if (isEnabled) {
      // Disable channel: remove from dashboard enabled list only
      // This only affects the mixed feed, not overlays or settings
      this.dashboardPreferences.removeMixedEnabledChannelId(channelRef);
    } else {
      // Enable channel: add to dashboard enabled list
      this.dashboardPreferences.addMixedEnabledChannelId(channelRef);
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
    // Channel is disabled if it's NOT in the enabled list
    // (Channels hidden in settings don't appear in the filter at all)
    return !this.enabledChannels().has(channelRef);
  }

  toggleFilterDropdown(): void {
    this.showFilterDropdown.update((show) => !show);
  }

  closeFilterDropdown(): void {
    this.showFilterDropdown.set(false);
  }

  isChannelEnabledMixed(channelRef: string): boolean {
    return this.enabledChannels().has(channelRef);
  }

  toggleMixedChannelFilter(channelRef: string): void {
    // CDK can emit a click after drag ends; prevent toggling filter in that case.
    if (this.isDragging || this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    const current = this.enabledChannels();
    const isEnabled = current.has(channelRef);

    if (isEnabled) {
      this.dashboardPreferences.removeMixedEnabledChannelId(channelRef);
    } else {
      this.dashboardPreferences.addMixedEnabledChannelId(channelRef);
    }
    this.cdr.markForCheck();
  }

  enableAllChannels(): void {
    // Enable all visible channels in mixed feed only
    // Add all visible channels to dashboard enabled list
    // Does NOT change channel visibility in settings or overlay configurations
    const channels = this.chatListService.channels();
    const allChannelRefs = channels
      .filter((ch) => ch.isVisible)
      .map((ch) => this.channelRefFor(ch));

    this.dashboardPreferences.setMixedEnabledChannelIds(allChannelRefs);
    this.cdr.markForCheck();
  }

  disableAllChannels(): void {
    // Disable all channels in mixed feed only
    // Clear dashboard enabled list
    // Does NOT change channel visibility in settings or overlay configurations
    this.dashboardPreferences.setMixedEnabledChannelIds([]);
    this.cdr.markForCheck();
  }

  channelRefFor(channel: ChatChannel): string {
    return buildChannelRef(channel.platform, channel.channelId);
  }

  readonly loadChannelImage = (channel: ChatChannel): void => {
    this.channelAvatars.ensureChannelImageForChannel(channel);
  };

  // Check if any platform has authorized account for sending messages
  readonly hasAnyAuthorizedPlatform = computed(() => {
    const platforms = this.feedData.platformsWithVisibleChannels();
    return platforms.some((p) => this.authorizationService.isAuthorized(p));
  });

  // Get list of authorized platforms with visible channels
  readonly authorizedPlatforms = computed(() => {
    const platforms = this.feedData.platformsWithVisibleChannels();
    return platforms.filter((p) => this.authorizationService.isAuthorized(p));
  });

  composerPlaceholder(): string {
    if (!this.hasAnyAuthorizedPlatform()) {
      return "Connect an account to send messages";
    }
    if (this.interactions.replyTargetMessageId()) {
      return "Write a reply…";
    }
    return "Send message to active channels…";
  }

  onComposerKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key !== "Enter") {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    this.sendMixedComposer(input);
  }

  sendMixedComposer(input: HTMLInputElement): void {
    // Block sending if no authorized platforms
    if (!this.hasAnyAuthorizedPlatform()) {
      return;
    }

    const text = input.value.trim();
    if (!text) {
      return;
    }

    // Handle reply if replying to a message
    if (this.interactions.replyTargetMessageId()) {
      this.interactions.submitReplyFromComposer(text);
      input.value = "";
      return;
    }

    // Send to all ENABLED channels in mixed feed (not just first visible)
    // This ensures the sent message appears in the mixed feed view
    // Use optimistic: false to wait for service echo instead of showing local message
    const enabledChannels = this.enabledVisibleChannels();

    for (const channel of enabledChannels) {
      // Only send if platform is authorized for this channel
      if (this.authorizationService.isAuthorized(channel.platform)) {
        void this.chatStateService.sendOutgoingChatMessage(
          channel.channelId,
          channel.platform,
          text,
          false // Don't create optimistic message - wait for service echo
        );
      }
    }

    input.value = "";
  }

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
