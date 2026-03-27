import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DashboardMixedFeedComponent } from "@components/dashboard-mixed-feed/dashboard-mixed-feed.component";
import { DashboardSplitFeedComponent } from "@components/dashboard-split-feed/dashboard-split-feed.component";
import { UserProfilePopoverComponent } from "@components/user-profile-popover/user-profile-popover";
import { FeedMode, PlatformType, ChatMessage } from "@models/chat.model";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { ChatStateManagerService } from "@services/data/chat-state-manager.service";
import { ChatSearchComponent } from "@components/chat-search/chat-search.component";
import { ChatStateService } from "@services/data/chat-state.service";
import { PinnedMessagesPanelComponent } from "@components/pinned-messages-panel/pinned-messages-panel.component";
import { PinnedMessagesService } from "@services/ui/pinned-messages.service";

@Component({
  selector: "app-dashboard-view",
  imports: [
    DashboardSplitFeedComponent,
    DashboardMixedFeedComponent,
    UserProfilePopoverComponent,
    MatIconModule,
    ChatSearchComponent,
    PinnedMessagesPanelComponent,
  ],
  templateUrl: "./dashboard.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardView {
  readonly chatListService = inject(ChatListService);
  readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  readonly chatProviderCoordinator = inject(ChatProviderCoordinatorService);
  readonly dashboardStateService = inject(DashboardStateService);
  readonly overlaySourceBridge = inject(OverlaySourceBridgeService);
  private readonly feedData = inject(DashboardFeedDataService);
  private readonly chatStateManager = inject(ChatStateManagerService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly pinnedMessagesService = inject(PinnedMessagesService);

  // Reference to split feed component for resetting sizes
  readonly splitFeed = viewChild<DashboardSplitFeedComponent>(DashboardSplitFeedComponent);

  readonly feedModes: FeedMode[] = ["mixed", "split"];
  readonly showSearch = signal(false);
  readonly showPinned = signal(false);
  readonly pinnedCount = this.pinnedMessagesService.pinnedCount;

  constructor() {
    const featured = this.dashboardStateService.featuredWidget();
    const port = featured?.port ?? 1421;
    void this.overlaySourceBridge.ensureConnected(port);

    // Track channel connections using global state from ChatStateManagerService.
    // This prevents re-connecting channels when navigating back from settings.
    effect(() => {
      const channels = this.feedData.allVisibleChannels();

      // Only connect channels that aren't already connected globally
      for (const ch of channels) {
        if (!this.chatStateManager.isChannelConnected(ch.channelId)) {
          this.chatProviderCoordinator.connectChannel(ch.channelId, ch.platform);
          this.chatStateManager.markChannelAsConnected(ch.channelId);
        }
      }
    });
  }

  setFeedMode(feedMode: FeedMode): void {
    this.dashboardPreferencesService.setFeedMode(feedMode);
  }

  getFeedMode(): FeedMode {
    return this.dashboardPreferencesService.preferences().feedMode;
  }

  resetSplitSizes(): void {
    this.splitFeed()?.resetBlockSizes();
  }

  toggleSearch(): void {
    this.showSearch.update(show => !show);
  }

  togglePinned(): void {
    this.showPinned.update(show => !show);
  }

  onMessageSelected(message: ChatMessage): void {
    // Highlight the selected message
    this.chatStateService.highlightMessage(message.id);
    this.showSearch.set(false);
  }
}
