/* sys lib */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { UpperCasePipe } from "@angular/common";

/* models */
import { ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import {
  ChatHistoryExportService,
  ExportFormat,
} from "@services/features/chat-history-export.service";

/* helpers */
import {
  getPlatformBadgeClasses,
  getPlatformLabel,
  YOUTUBE_DATA_API_KEY_STORAGE_KEY,
} from "@helpers/chat.helper";

/* components */
import { CheckboxComponent } from "@components/ui/checkbox/checkbox.component";
import { BlockedWordsSettingsComponent } from "@components/blocked-words-settings/blocked-words-settings.component";
import { HighlightRulesSettingsComponent } from "@components/highlight-rules-settings/highlight-rules-settings.component";
import { KeyboardShortcutsSettingsComponent } from "@components/keyboard-shortcuts-settings/keyboard-shortcuts-settings.component";
import { SessionExportSettingsComponent } from "@components/session-export-settings/session-export-settings.component";
import { SettingsSectionComponent } from "@components/ui/settings-section/settings-section.component";
import { SharedHeaderComponent } from "@components/shared-header/shared-header.component";
@Component({
  selector: "app-settings-page-view",
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    UpperCasePipe,
    CheckboxComponent,
    BlockedWordsSettingsComponent,
    HighlightRulesSettingsComponent,
    KeyboardShortcutsSettingsComponent,
    SessionExportSettingsComponent,
    SettingsSectionComponent,
    SharedHeaderComponent,
  ],
  templateUrl: "./settings-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageView {
  readonly authorizationService = inject(AuthorizationService);
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  private readonly chatHistoryExport = inject(ChatHistoryExportService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly localStorageService = inject(LocalStorageService);

  readonly platforms: PlatformType[] = ["twitch", "kick", "youtube"];
  readonly getPlatformBadgeClasses = getPlatformBadgeClasses;

  // Local computed signals to avoid direct service signal reads in template
  readonly channels = computed(() => this.chatListService.channels());
  readonly visibleChannels = computed(() => this.chatListService.getVisibleChannels());

  newChannelName = "";
  selectedPlatform: PlatformType = "twitch";
  selectedAccountId = "";
  youtubeApiKey = "";

  /** Edit mode state */
  editingChannelId: string | null = null;
  editingChannelName: string = "";

  /** Export options */
  exportFormat: ExportFormat = "txt";
  exportIncludeTimestamps = true;
  exportIncludePlatform = false;
  exportIncludeBadges = false;
  selectedExportChannelId = "";

  /** Export statistics */
  readonly exportStats = () => this.chatHistoryExport.getExportStats();

  /** Section collapse state management */
  readonly sectionStates = signal<Record<string, boolean>>({
    authorization: true,
    youtube: true,
    blockedWords: true,
    highlightRules: true,
    keyboardShortcuts: true,
    sessionExport: true,
    channelManagement: true,
    chatHistoryExport: true,
  });

  /** Collapse all sections */
  collapseAll(): void {
    this.sectionStates.set({
      authorization: true,
      youtube: true,
      blockedWords: true,
      highlightRules: true,
      keyboardShortcuts: true,
      sessionExport: true,
      channelManagement: true,
      chatHistoryExport: true,
    });
    this.changeDetectorRef.markForCheck();
  }

  /** Expand all sections */
  expandAll(): void {
    this.sectionStates.set({
      authorization: false,
      youtube: false,
      blockedWords: false,
      highlightRules: false,
      keyboardShortcuts: false,
      sessionExport: false,
      channelManagement: false,
      chatHistoryExport: false,
    });
    this.changeDetectorRef.markForCheck();
  }

  /** Toggle a specific section */
  toggleSection(sectionId: string): void {
    this.sectionStates.update((states) => ({
      ...states,
      [sectionId]: !states[sectionId],
    }));
    this.changeDetectorRef.markForCheck();
  }

  /** Check if all sections are collapsed */
  allCollapsed = computed(() => {
    const states = this.sectionStates();
    return Object.values(states).every((v) => v);
  });

  /** Update section state - helper for template */
  updateSectionState(sectionId: string, collapsed: boolean): void {
    this.sectionStates.update((states) => ({
      ...states,
      [sectionId]: collapsed,
    }));
    this.changeDetectorRef.markForCheck();
  }

  constructor() {
    effect(() => {
      this.youtubeApiKey = this.localStorageService.get(YOUTUBE_DATA_API_KEY_STORAGE_KEY, "");
      this.changeDetectorRef.markForCheck();
    });
  }

  saveYoutubeApiKey(): void {
    const trimmed = this.youtubeApiKey.trim();
    if (trimmed) {
      this.localStorageService.set(YOUTUBE_DATA_API_KEY_STORAGE_KEY, trimmed);
    } else {
      this.localStorageService.remove(YOUTUBE_DATA_API_KEY_STORAGE_KEY);
    }
  }

  authorize(platform: PlatformType): void {
    void this.authorizationService.authorize(platform);
  }

  deauthorize(platform: PlatformType): void {
    void this.authorizationService.deauthorize(platform);
  }

  deauthorizeAccount(platform: PlatformType): void {
    const account = this.getAuthorizedAccounts(platform)[0];
    if (!account) {
      return;
    }
    void this.authorizationService.deauthorizeAccount(account.id, account.platform);
  }

  removeAuthorizedAccount(account: ChatAccount): void {
    void this.authorizationService.deauthorizeAccount(account.id, account.platform);
  }

  addChannel(): void {
    if (!this.newChannelName.trim()) {
      return;
    }

    this.chatListService.addChannel(
      this.selectedPlatform,
      this.newChannelName.trim(),
      undefined,
      this.selectedAccountId || undefined,
      this.authorizationService.getAccountById(this.selectedAccountId)?.username
    );
    this.newChannelName = "";
  }

  removeChannel(channelId: string): void {
    this.chatListService.removeChannel(channelId);
  }

  toggleChannelVisibility(channelId: string): void {
    // Simply toggle channel visibility
    // This affects getVisibleChannels() which is used everywhere
    this.chatListService.toggleChannelVisibility(channelId);
  }

  updateChannelAccount(channelId: string, accountId: string): void {
    this.chatListService.updateChannelAccount(
      channelId,
      accountId || undefined,
      this.authorizationService.getAccountById(accountId)?.username
    );
  }

  /** Start editing a channel name */
  startEditChannel(channelId: string, currentName: string): void {
    this.editingChannelId = channelId;
    this.editingChannelName = currentName;
    this.changeDetectorRef.markForCheck();
  }

  /** Save edited channel name */
  saveEditChannel(): void {
    if (!this.editingChannelId || !this.editingChannelName.trim()) {
      return;
    }
    this.chatListService.updateChannelName(this.editingChannelId, this.editingChannelName.trim());
    this.editingChannelId = null;
    this.editingChannelName = "";
    this.changeDetectorRef.markForCheck();
  }

  /** Cancel editing */
  cancelEditChannel(): void {
    this.editingChannelId = null;
    this.editingChannelName = "";
    this.changeDetectorRef.markForCheck();
  }

  getAuthorizedAccounts(platform: PlatformType) {
    return this.authorizationService.accounts().filter((account) => account.platform === platform);
  }

  getChannelManagementAccounts(): ChatAccount[] {
    return this.authorizationService.accounts();
  }

  getAccountLabelById(accountId: string | undefined): string | null {
    if (!accountId) {
      return null;
    }
    const account = this.getChannelManagementAccounts().find((item) => item.id === accountId);
    return account?.username ?? null;
  }

  getAccountIcon(accountId: string): string {
    const account = this.getChannelManagementAccounts().find((item) => item.id === accountId);
    if (!account) {
      return "";
    }
    // Return a default avatar or profile image URL if available
    // For now, return a placeholder based on username
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(account.username)}&background=random&size=32`;
  }

  getPlatformLbl(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  getChannelNamePlaceholder(): string {
    return this.selectedPlatform === "youtube"
      ? "YouTube live video ID or watch/live URL"
      : "Channel name...";
  }

  /** Export all chat history */
  async exportAllHistory(): Promise<void> {
    try {
      await this.chatHistoryExport.exportAllHistory({
        format: this.exportFormat,
        includeTimestamps: this.exportIncludeTimestamps,
        includePlatform: this.exportIncludePlatform,
        includeBadges: this.exportIncludeBadges,
        dateFormat: "iso",
      });
    } catch {
      /* export failed — error already surfaced by export service if thrown */
    }
  }

  /** Export selected channel history */
  async exportSelectedChannel(): Promise<void> {
    const channelId = this.selectedExportChannelId;
    if (!channelId) {
      return;
    }

    const channel = this.chatListService.channels().find((ch) => ch.id === channelId);
    if (!channel) {
      return;
    }

    try {
      await this.chatHistoryExport.exportChannelHistory(channel.channelId, channel.platform, {
        format: this.exportFormat,
        includeTimestamps: this.exportIncludeTimestamps,
        includePlatform: this.exportIncludePlatform,
        includeBadges: this.exportIncludeBadges,
        dateFormat: "time",
      });
    } catch {
      /* export failed */
    }
  }
}
