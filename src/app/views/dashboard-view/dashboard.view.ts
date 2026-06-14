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
import { ChatMessage } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateService } from "@services/data/chat-state.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { OVERLAY_CONSTANTS } from "@shared/utils/constants";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { KeyboardShortcutsService } from "@services/ui/keyboard-shortcuts.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";
import { PinnedMessagesService } from "@services/ui/pinned-messages.service";
import { ThemeService } from "@services/core/theme.service";

/* components */
import { ChatSearchComponent } from "@components/chat-search/chat-search.component";
import { DashboardHeaderComponent } from "@components/dashboard-header/dashboard-header.component";
import { DashboardComponent } from "@components/dashboard/dashboard.component";
import { KeyboardShortcutsHelpComponent } from "@components/keyboard-shortcuts-help/keyboard-shortcuts-help.component";
import { PinnedMessagesPanelComponent } from "@components/pinned-messages-panel/pinned-messages-panel.component";
import { UserProfilePopoverComponent } from "@components/user-profile-popover/user-profile-popover.component";
@Component({
  selector: "app-dashboard-view",
  standalone: true,
  imports: [
    DashboardHeaderComponent,
    DashboardComponent,
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
  private readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;

  readonly platformFilter = signal<string>("all");

  onPlatformFilterChange(filter: string): void {
    this.platformFilter.set(filter);
  }

  readonly showSearch = signal(false);
  readonly showPinned = signal(false);
  readonly showShortcuts = signal(false);
  readonly pinnedCount = this.pinnedMessagesService.pinnedCount;

  constructor() {
    const featured = this.dashboardStateService.featuredWidget();
    const port = featured?.port ?? OVERLAY_CONSTANTS.DEFAULT_PORT;
    void this.overlaySourceBridge.ensureConnected(port);

    const cleanups = [
      this.keyboardShortcutsService.registerAction("open-search", () => this.toggleSearch()),
      this.keyboardShortcutsService.registerAction("open-pinned", () => this.togglePinned()),
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

  closeAllModals(): void {
    if (this.showSearch()) {
      this.showSearch.set(false);
    } else if (this.showPinned()) {
      this.showPinned.set(false);
    } else if (this.showShortcuts()) {
      this.showShortcuts.set(false);
    }
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
