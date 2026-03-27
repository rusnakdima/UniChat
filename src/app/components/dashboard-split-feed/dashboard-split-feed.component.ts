import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { MatIconModule } from "@angular/material/icon";
import { ChatChannel, PlatformType } from "@models/chat.model";
import { ChatStateService } from "@services/data/chat-state.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { SplitFeedUiService } from "@services/ui/split-feed-ui.service";
import { BlockResizeService } from "@services/ui/block-resize.service";
import { ChatScrollRegionComponent } from "@components/chat-scroll-region/chat-scroll-region.component";
import { ChatMessageCardComponent } from "@components/chat-message-card/chat-message-card.component";
import { ChatHistoryHeaderComponent } from "@components/chat-history-header/chat-history-header.component";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ConnectionErrorBannerComponent } from "@components/connection-error-banner/connection-error-banner.component";
import { ConnectionStateService } from "@services/data/connection-state.service";

@Component({
  selector: "app-dashboard-split-feed",
  host: {
    class: "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden",
  },
  imports: [
    DragDropModule,
    MatIconModule,
    ChatScrollRegionComponent,
    ChatMessageCardComponent,
    ChatHistoryHeaderComponent,
    ConnectionErrorBannerComponent,
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
  private readonly chatProviderCoordinator = inject(ChatProviderCoordinatorService);
  private readonly avatarCache = inject(AvatarCacheService);

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

  constructor() {
    // Keep persisted block widths consistent with the currently visible platform subset.
    // Otherwise, if (for example) `kick` disappears, the stored widths for the remaining blocks
    // may sum to < 100%, leaving blank space.
    effect(() => {
      const platforms = this.feedData.platformsWithVisibleChannels();
      this.normalizeBlockWidths(platforms);
    });

    effect(() => {
      for (const platform of this.feedData.platformsWithVisibleChannels()) {
        const channels = this.feedData.orderedChannelsForPlatform(platform);
        this.splitUi.ensureActiveChannel(platform, channels);
        // Connect and load messages for the active channel
        const activeChannel = this.activeChannel(platform);
        if (activeChannel) {
          // Connect the channel to the provider
          this.chatProviderCoordinator.connectChannel(
            activeChannel.channelId,
            activeChannel.platform
          );
          // Mark channel as loaded for message display
          this.feedData.loadChannelMessages(platform, activeChannel.channelId);
        }
      }
    });
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
    return this.feedData.platformsWithVisibleChannels().indexOf(platform);
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
    return this.feedData.orderedChannelsForPlatform(platform);
  }

  draggableOrderedChannels(platform: PlatformType): ChatChannel[] {
    // CDK drag-drop announcements/accessibility assume data values are strings.
    return this.orderedChannels(platform).filter((ch) => {
      const id = ch.channelId;
      return typeof id === "string" && id.trim().length > 0;
    });
  }

  orderedChannelIds(platform: PlatformType): string[] {
    return this.draggableOrderedChannels(platform).map((ch) => ch.channelId);
  }

  activeChannel(platform: PlatformType): ChatChannel | undefined {
    const id = this.splitUi.activeChannelId(platform);
    const list = this.orderedChannels(platform);
    return list.find((c) => c.channelId === id) ?? list[0];
  }

  activeChannelId(platform: PlatformType): string | undefined {
    return this.activeChannel(platform)?.channelId;
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
    const visibleCopy = [...this.feedData.platformsWithVisibleChannels()];
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

  async onLoadHistory(event: {
    channelId: string | undefined;
    platform: string | undefined;
    count: number;
  }): Promise<void> {
    // For split feed, load history for the specific channel if provided,
    // otherwise load for the active channel of each platform
    const platforms = this.feedData.platformsWithVisibleChannels();

    if (event.channelId && event.platform) {
      // Load history for specific channel (Twitch only)
      // Use both channelId and platform to ensure we load for the correct platform
      if (event.platform === "twitch") {
        const messages = await this.twitchChat.loadChannelHistory(event.channelId, event.count);
        if (messages.length > 0) {
          this.chatStorage.prependMessages(event.channelId, messages);
        }
      }
    } else if (event.channelId) {
      // channelId provided but no platform - find the channel
      const allChannels = this.chatListService.getChannels();
      const channel = allChannels.find((ch: ChatChannel) => ch.channelId === event.channelId);

      if (channel && channel.platform === "twitch") {
        const messages = await this.twitchChat.loadChannelHistory(channel.channelId, event.count);
        if (messages.length > 0) {
          this.chatStorage.prependMessages(channel.channelId, messages);
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
            this.chatStorage.prependMessages(activeChannel.channelId, messages);
          }
        }
      }
    }

    // Notify the history header that loading is complete
    this.historyHeader()?.setLoadingComplete(true, true);
  }
}
