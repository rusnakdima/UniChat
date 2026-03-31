/* sys lib */
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { ChatChannel, ChatMessage, PlatformType } from "@models/chat.model";

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateService } from "@services/data/chat-state.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { BlockResizeService } from "@services/ui/block-resize.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { KeyboardShortcutsService } from "@services/ui/keyboard-shortcuts.service";
import { SplitFeedUiService } from "@services/ui/split-feed-ui.service";
import { buildChannelRef } from "@utils/channel-ref.util";

/* components */
import { ChatHistoryHeaderComponent } from "@components/chat-history-header/chat-history-header.component";
import { ChatMessageCardComponent } from "@components/chat-message-card/chat-message-card.component";
import { ChatScrollRegionComponent } from "@components/chat-scroll-region/chat-scroll-region.component";
import { ComposerEmotePopoverComponent } from "@components/composer-emote-popover/composer-emote-popover.component";
import { ConnectionErrorBannerComponent } from "@components/connection-error-banner/connection-error-banner.component";

interface SplitPlatformViewModel {
  orderedChannels: ChatChannel[];
  draggableOrderedChannels: ChatChannel[];
  orderedChannelIds: string[];
  activeChannel?: ChatChannel;
  activeChannelId?: string;
}

@Component({
  selector: "app-dashboard-split-feed",
  standalone: true,
  host: {
    class: "flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden",
  },
  imports: [
    DragDropModule,
    MatIconModule,
    ChatScrollRegionComponent,
    ChatMessageCardComponent,
    ChatHistoryHeaderComponent,
    ConnectionErrorBannerComponent,
    ComposerEmotePopoverComponent,
  ],
  templateUrl: "./dashboard-split-feed.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSplitFeedComponent {
  readonly feedData = inject(DashboardFeedDataService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly interactions = inject(DashboardChatInteractionService);
  readonly splitUi = inject(SplitFeedUiService);
  readonly blockResize = inject(BlockResizeService);
  readonly connectionStateService = inject(ConnectionStateService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly chatListService = inject(ChatListService);
  private readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly chatStorage = inject(ChatStorageService);
  private readonly avatarCache = inject(AvatarCacheService);
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);
  private readonly destroyRef = inject(DestroyRef);

  // Reference to the history header component
  readonly historyHeader = viewChild<
    HTMLElement & { setLoadingComplete(success: boolean, hasMore: boolean): void }
  >("historyHeader");

  isReorderingChannels = signal(false);
  isResizing = signal(false);
  resizeData = signal<{
    platform: PlatformType;
    containerRect: DOMRect;
    leftPlatform: PlatformType;
    rightPlatform: PlatformType;
    leftBlockRect?: DOMRect;
  } | null>(null);
  resizeTrackerX = signal<number>(0);

  // Track block widths in pixels for precise resizing
  blockWidthsPx = signal<Map<string, number>>(new Map());

  readonly visiblePlatforms = this.feedData.platformsWithVisibleChannels;

  // Signal-based messages for each platform - directly reads from storage to ensure reactivity
  readonly platformMessages = computed(() => {
    this.feedData.messageVersion();
    this.feedData.channelsByPlatform();

    const messagesByPlatform: Partial<Record<PlatformType, ChatMessage[]>> = {};
    for (const platform of this.visiblePlatforms()) {
      const activeChannelId = this.activeChannelId(platform);
      if (activeChannelId) {
        const channelRef = buildChannelRef(platform, activeChannelId.toLowerCase());
        if (this.chatStorage.isChannelLoaded(channelRef)) {
          const allMessages = this.chatStorage.channelMessages();
          messagesByPlatform[platform] = allMessages[channelRef] ?? [];
        } else {
          messagesByPlatform[platform] = [];
        }
      }
    }
    return messagesByPlatform;
  });

  private readonly platformViewModels = computed(() => {
    // Force dependency on message changes via feedData's messageVersion computed
    this.feedData.messageVersion();

    this.feedData.channelsByPlatform();
    this.dashboardPreferencesService.preferences();
    const activeChannelIds = this.splitUi.activeChannelIdByPlatform();
    const visiblePlats = this.visiblePlatforms();
    const viewModels: Partial<Record<PlatformType, SplitPlatformViewModel>> = {};

    for (const platform of visiblePlats) {
      const orderedChannels = this.feedData.orderedChannelsForPlatform(platform);
      const draggableOrderedChannels = orderedChannels.filter((channel) => {
        const id = channel.channelId;
        return typeof id === "string" && id.trim().length > 0;
      });
      const activeChannelId = activeChannelIds[platform];
      const activeChannel =
        orderedChannels.find((channel) => channel.channelId === activeChannelId) ??
        orderedChannels[0];

      viewModels[platform] = {
        orderedChannels,
        draggableOrderedChannels,
        orderedChannelIds: draggableOrderedChannels.map((channel) => channel.channelId),
        activeChannel,
        activeChannelId: activeChannel?.channelId,
      };
    }

    return viewModels;
  });

  constructor() {
    // Keep persisted block widths consistent with the currently visible platform subset.
    // Otherwise, if (for example) `kick` disappears, the stored widths for the remaining blocks
    // may sum to < 100%, leaving blank space.
    effect(() => {
      const platforms = this.visiblePlatforms();
      this.normalizeBlockWidths(platforms);
    });

    effect(() => {
      for (const platform of this.visiblePlatforms()) {
        const channels = this.platformState(platform).orderedChannels;
        this.splitUi.ensureActiveChannel(platform, channels);
        const activeChannel = this.platformState(platform).activeChannel;
        if (activeChannel) {
          this.feedData.loadChannelMessages(platform, activeChannel.channelId);
        }
      }
    });

    const unsubSend = this.keyboardShortcutsService.registerAction("send-message", () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement)) {
        return;
      }
      const p = el.dataset["unichatComposer"] as PlatformType | undefined;
      if (!p || !this.visiblePlatforms().includes(p)) {
        return;
      }
      this.sendSplitComposer(p, el);
    });
    this.destroyRef.onDestroy(() => unsubSend());
  }

  private normalizeBlockWidths(platforms: PlatformType[]): void {
    if (platforms.length === 0) {
      return;
    }

    const defaultWidth = 100 / platforms.length;
    const widths = platforms.map((p) => ({
      platform: p,
      width: this.blockResize.getBlockWidth(p) ?? defaultWidth,
    }));

    const sum = widths.reduce((acc, w) => acc + w.width, 0);
    if (!Number.isFinite(sum) || sum <= 0) {
      return;
    }

    // If the stored subset already sums to ~100%, don't touch persisted values.
    const EPSILON = 0.5; // percent
    if (Math.abs(sum - 100) <= EPSILON) {
      return;
    }

    for (const { platform, width } of widths) {
      const normalized = (width / sum) * 100;
      this.blockResize.setBlockWidth(platform, normalized);
    }
  }

  getBlockWidth(platform: PlatformType): string {
    const platforms = this.feedData.platformsWithVisibleChannels();
    const platformCount = platforms.length;
    const stored = this.blockResize.getBlockWidth(platform);

    if (stored) {
      return `${stored}%`;
    }

    // Default: equal width for all blocks in single row
    const defaultWidth = 100 / platformCount;
    return `${defaultWidth}%`;
  }

  getBlockFlex(platform: PlatformType): string {
    // Use flex with explicit flex-basis to control width in flex container
    const stored = this.blockResize.getBlockWidth(platform);
    if (stored) {
      return `0 0 ${stored}%`;
    }
    // Default: equal distribution
    return "1 1 0";
  }

  /**
   * Get the index of a platform in the visible platforms list
   */
  private getPlatformIndex(platform: PlatformType): number {
    return this.visiblePlatforms().indexOf(platform);
  }

  onResizeStart(platform: PlatformType, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const container = event.currentTarget as HTMLElement;
    const gridContainer = container.closest("[cdkDropList]") as HTMLElement;
    const containerRect =
      gridContainer?.getBoundingClientRect() ?? container.getBoundingClientRect();

    // The resize handle is on the RIGHT edge of the current platform block
    // So we're resizing between this platform (left) and the next one (right)
    const platforms = this.feedData.visiblePlatformsInOrder();
    const currentIndex = this.getPlatformIndex(platform);
    const nextIndex = currentIndex + 1;

    // Don't allow resize if this is the last platform (no right neighbor)
    if (nextIndex >= platforms.length) {
      return;
    }

    const leftPlatform = platform;
    const rightPlatform = platforms[nextIndex];

    // Get the left block element to calculate its position
    const leftBlockElement = container.closest("[cdkDrag]") as HTMLElement;
    const leftBlockRect = leftBlockElement?.getBoundingClientRect();

    this.isResizing.set(true);

    this.resizeData.set({
      platform,
      containerRect,
      leftPlatform,
      rightPlatform,
      leftBlockRect,
    });

    const onMouseMove = (moveEvent: MouseEvent) => {
      const data = this.resizeData();
      if (!data) return;
      this.onResizeMove(data, moveEvent);
    };

    const onMouseUp = () => {
      this.onResizeEnd();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  onResizeMove(
    data: {
      platform: PlatformType;
      containerRect: DOMRect;
      leftPlatform: PlatformType;
      rightPlatform: PlatformType;
      leftBlockRect?: DOMRect;
    },
    event: MouseEvent
  ): void {
    // Update resize tracker position to follow mouse
    this.resizeTrackerX.set(event.clientX);

    // Get current widths of both blocks
    const currentLeftWidth = this.blockResize.getBlockWidth(data.leftPlatform);
    const currentRightWidth = this.blockResize.getBlockWidth(data.rightPlatform);

    // If no stored widths, assume equal distribution
    const leftWidth = currentLeftWidth ?? 100 / this.feedData.visiblePlatformsInOrder().length;
    const rightWidth = currentRightWidth ?? 100 / this.feedData.visiblePlatformsInOrder().length;
    const totalShared = leftWidth + rightWidth;

    // Calculate mouse position as percentage of total container width
    const mousePercent =
      ((event.clientX - data.containerRect.left) / data.containerRect.width) * 100;

    // Calculate the offset (sum of all widths before the left block)
    const platforms = this.feedData.visiblePlatformsInOrder();
    const leftIndex = this.getPlatformIndex(data.leftPlatform);
    let offset = 0;
    for (let i = 0; i < leftIndex; i++) {
      offset += this.blockResize.getBlockWidth(platforms[i]) ?? 100 / platforms.length;
    }

    // The new left width is the mouse position minus the offset
    const newLeftWidth = mousePercent - offset;

    // Clamp to reasonable bounds (5% minimum for each block)
    const clampedWidth = Math.max(5, Math.min(totalShared - 5, newLeftWidth));

    // Use resizePair to update both blocks atomically
    this.blockResize.resizePair(data.leftPlatform, data.rightPlatform, clampedWidth, totalShared);
  }

  onResizeEnd(): void {
    this.isResizing.set(false);
    this.resizeData.set(null);
    this.resizeTrackerX.set(0);
  }

  resetBlockSizes(): void {
    this.blockResize.resetWidths();
  }

  getContainerLeft(): number {
    if (typeof window === "undefined") return 0;
    const element = document.querySelector("[cdkDropList]");
    return element?.getBoundingClientRect().left ?? 0;
  }

  orderedChannels(platform: PlatformType): ChatChannel[] {
    return this.platformState(platform).orderedChannels;
  }

  draggableOrderedChannels(platform: PlatformType): ChatChannel[] {
    return this.platformState(platform).draggableOrderedChannels;
  }

  orderedChannelIds(platform: PlatformType): string[] {
    return this.platformState(platform).orderedChannelIds;
  }

  activeChannel(platform: PlatformType): ChatChannel | undefined {
    return this.platformState(platform).activeChannel;
  }

  activeChannelId(platform: PlatformType): string | undefined {
    return this.platformState(platform).activeChannelId;
  }

  selectChannel(platform: PlatformType, channel: ChatChannel): void {
    this.splitUi.setActiveChannel(platform, channel.channelId);
    // Load messages for this channel (lazy loading)
    this.feedData.loadChannelMessages(platform, channel.channelId);
  }

  isChannelActive(platform: PlatformType, channel: ChatChannel): boolean {
    return this.activeChannelId(platform) === channel.channelId;
  }

  onChannelDragStarted(): void {
    this.isReorderingChannels.set(true);
  }

  onChannelDragEnded(): void {
    this.isReorderingChannels.set(false);
  }

  onChannelClick(platform: PlatformType, channel: ChatChannel): void {
    // Prevent click selection while user is dragging to reorder.
    if (this.isReorderingChannels()) {
      return;
    }
    this.selectChannel(platform, channel);
  }

  onComposerKeydown(event: KeyboardEvent, platform: PlatformType, input: HTMLInputElement): void {
    if (event.key !== "Enter") {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    this.sendSplitComposer(platform, input);
  }

  sendSplitComposer(platform: PlatformType, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) {
      return;
    }
    const reply = this.interactions.replyTargetMessage();
    if (this.interactions.replyTargetMessageId() && reply?.platform === platform) {
      this.interactions.submitReplyFromComposer(text);
      input.value = "";
      return;
    }
    const ch = this.activeChannel(platform);
    if (!ch) {
      return;
    }
    void this.chatStateService.sendOutgoingChatMessage(ch.channelId, platform, text);
    input.value = "";
  }

  composerPlaceholder(platform: PlatformType): string {
    const reply = this.interactions.replyTargetMessage();
    if (this.interactions.replyTargetMessageId() && reply?.platform === platform) {
      return "Write a reply…";
    }
    return "Send message…";
  }

  onPlatformDrop(event: CdkDragDrop<PlatformType[]>): void {
    const visibleCopy = [...this.visiblePlatforms()];
    moveItemInArray(visibleCopy, event.previousIndex, event.currentIndex);
    this.dashboardPreferencesService.setSplitOrderedPlatforms(visibleCopy);
  }

  onChannelDrop(platform: PlatformType, event: CdkDragDrop<string[]>): void {
    const current = this.draggableOrderedChannels(platform).map((ch) => ch.channelId);
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.dashboardPreferencesService.setChannelOrderForPlatform(platform, current);

    // Keep the active channel aligned with the dragged channel after reorder.
    const draggedChannelId = event.item?.data as string | undefined;
    if (draggedChannelId && draggedChannelId.trim().length > 0) {
      this.splitUi.setActiveChannel(platform, draggedChannelId);
    }
  }

  /** Get channel profile image URL (loads on demand for Twitch) */
  async getChannelImageUrl(channel: ChatChannel): Promise<string | null> {
    // Check centralized cache first
    const cached = this.avatarCache.getChannelAvatar(channel.channelId);
    if (cached) {
      return cached;
    }

    // For Twitch channels, fetch from API
    if (channel.platform === "twitch") {
      try {
        const imageUrl = await this.twitchChat.fetchChannelProfileImage(channel.channelName);
        if (imageUrl) {
          this.avatarCache.setChannelAvatar(channel.channelId, imageUrl);
          return imageUrl;
        }
      } catch {
        // Ignore errors, will show placeholder
      }
    }

    return null;
  }

  /** Check if channel has image available (for template) */
  hasChannelImage(channel: ChatChannel): boolean {
    return this.avatarCache.hasChannelAvatar(channel.channelId);
  }

  /** Get cached image URL (for template) */
  getCachedChannelImage(channel: ChatChannel): string | null {
    return this.avatarCache.getChannelAvatar(channel.channelId) ?? null;
  }

  /** Load channel image on demand */
  loadChannelImage(channel: ChatChannel): void {
    if (!this.avatarCache.hasChannelAvatar(channel.channelId)) {
      void this.getChannelImageUrl(channel);
    }
  }

  channelRefFor(platform: PlatformType, channelId: string): string {
    return buildChannelRef(platform, channelId);
  }

  async onLoadHistory(event: {
    channelId: string | undefined;
    platform: string | undefined;
    count: number;
  }): Promise<void> {
    // For split feed, load history for the specific channel if provided,
    // otherwise load for the active channel of each platform
    const platforms = this.visiblePlatforms();

    if (event.channelId && event.platform) {
      // Load history for specific channel (Twitch only)
      // Use both channelId and platform to ensure we load for the correct platform
      if (event.platform === "twitch") {
        const messages = await this.twitchChat.loadChannelHistory(event.channelId, event.count);
        if (messages.length > 0) {
          this.chatStorage.prependMessages(buildChannelRef("twitch", event.channelId), messages);
        }
      }
    } else if (event.channelId) {
      // channelId provided but no platform - find the channel
      const allChannels = this.chatListService.getChannels();
      const channel = allChannels.find((ch: ChatChannel) => ch.channelId === event.channelId);

      if (channel && channel.platform === "twitch") {
        const messages = await this.twitchChat.loadChannelHistory(channel.channelId, event.count);
        if (messages.length > 0) {
          this.chatStorage.prependMessages(
            buildChannelRef(channel.platform, channel.channelId),
            messages
          );
        }
      }
    } else {
      // Load for active channels of each platform
      for (const platform of platforms) {
        const activeChannel = this.activeChannel(platform);
        if (activeChannel && activeChannel.platform === "twitch") {
          const messages = await this.twitchChat.loadChannelHistory(
            activeChannel.channelId,
            event.count
          );
          if (messages.length > 0) {
            this.chatStorage.prependMessages(
              buildChannelRef(activeChannel.platform, activeChannel.channelId),
              messages
            );
          }
        }
      }
    }

    // Notify the history header that loading is complete
    this.historyHeader()?.setLoadingComplete(true, true);
  }

  messagesForActiveChannel(platform: PlatformType): ChatMessage[] {
    const channelId = this.activeChannelId(platform);
    if (!channelId) {
      return [];
    }
    return this.feedData.getMessagesForChannel(platform, channelId);
  }

  private platformState(platform: PlatformType): SplitPlatformViewModel {
    return (
      this.platformViewModels()[platform] ?? {
        orderedChannels: [],
        draggableOrderedChannels: [],
        orderedChannelIds: [],
      }
    );
  }
}
