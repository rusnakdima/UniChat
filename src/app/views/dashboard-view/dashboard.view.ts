/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";

/* models */
import { FeedMode, ChatMessage } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateService } from "@services/data/chat-state.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { KeyboardShortcutsService } from "@services/ui/keyboard-shortcuts.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";
import { PinnedMessagesService } from "@services/ui/pinned-messages.service";

/* components */
import { ChatSearchComponent } from "@components/chat-search/chat-search.component";
import { DashboardHeaderComponent } from "@components/dashboard-header/dashboard-header.component";
import { DashboardMixedFeedComponent } from "@components/dashboard-mixed-feed/dashboard-mixed-feed.component";
import { DashboardSplitFeedComponent } from "@components/dashboard-split-feed/dashboard-split-feed.component";
import { KeyboardShortcutsHelpComponent } from "@components/keyboard-shortcuts-help/keyboard-shortcuts-help.component";
import { PinnedMessagesPanelComponent } from "@components/pinned-messages-panel/pinned-messages-panel.component";
import { UserProfilePopoverComponent } from "@components/user-profile-popover/user-profile-popover";
@Component({
  selector: "app-dashboard-view",
  standalone: true,
  imports: [
    DashboardHeaderComponent,
    DashboardSplitFeedComponent,
    DashboardMixedFeedComponent,
    UserProfilePopoverComponent,
    MatIconModule,
    ChatSearchComponent,
    PinnedMessagesPanelComponent,
    KeyboardShortcutsHelpComponent,
  ],
  templateUrl: "./dashboard.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardView {
  readonly chatListService = inject(ChatListService);
  readonly dashboardPreferencesService = inject(DashboardPreferencesService);
  readonly dashboardStateService = inject(DashboardStateService);
  readonly overlaySourceBridge = inject(OverlaySourceBridgeService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly interactions = inject(DashboardChatInteractionService);
  private readonly pinnedMessagesService = inject(PinnedMessagesService);
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // Reference to split feed component for resetting sizes
  readonly splitFeed = viewChild<DashboardSplitFeedComponent>(DashboardSplitFeedComponent);

  readonly feedModes: FeedMode[] = ["mixed", "split"];
  readonly showSearch = signal(false);
  readonly showPinned = signal(false);
  readonly showShortcuts = signal(false);
  readonly pinnedCount = this.pinnedMessagesService.pinnedCount;

  constructor() {
    const featured = this.dashboardStateService.featuredWidget();
    const port = featured?.port ?? 1421;
    void this.overlaySourceBridge.ensureConnected(port);

    const cleanups = [
      this.keyboardShortcutsService.registerAction("open-search", () => this.toggleSearch()),
      this.keyboardShortcutsService.registerAction("open-pinned", () => this.togglePinned()),
      this.keyboardShortcutsService.registerAction("toggle-feed-mode", () => this.toggleFeedMode()),
      this.keyboardShortcutsService.registerAction("close-modals", () => this.closeAllModals()),
      this.keyboardShortcutsService.registerAction("show-shortcuts", () => this.toggleShortcuts()),
      this.keyboardShortcutsService.registerAction("open-overlay-settings", () => {
        void this.router.navigate(["/overlay-management"]);
      }),
      this.keyboardShortcutsService.registerAction("reply-selected", () => {
        const id =
          this.chatStateService.highlightedMessageId() ?? this.interactions.replyTargetMessageId();
        if (id) {
          this.interactions.onReplyClick(id);
        }
      }),
      this.keyboardShortcutsService.registerAction("delete-selected", () => {
        const id =
          this.chatStateService.highlightedMessageId() ?? this.interactions.replyTargetMessageId();
        if (id) {
          this.interactions.deleteMessage(id);
        }
      }),
    ];
    this.destroyRef.onDestroy(() => {
      for (const u of cleanups) {
        u();
      }
    });
  }

  toggleFeedMode(): void {
    const current = this.getFeedMode();
    const next: FeedMode = current === "mixed" ? "split" : "mixed";
    this.setFeedMode(next);
  }

  closeAllModals(): void {
    if (this.showSearch()) {
      this.showSearch.set(false);
    } else if (this.showPinned()) {
      this.showPinned.set(false);
    } else if (this.showShortcuts()) {
      this.showShortcuts.set(false);
    }
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
    this.showSearch.update((show) => !show);
  }

  togglePinned(): void {
    this.showPinned.update((show) => !show);
  }

  toggleShortcuts(): void {
    this.showShortcuts.update((show) => !show);
  }

  onMessageSelected(message: ChatMessage): void {
    // Highlight the selected message
    this.chatStateService.highlightMessage(message.id);
    this.showSearch.set(false);
  }
}
