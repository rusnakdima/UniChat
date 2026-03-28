/* sys lib */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";

/* helpers */
import {
  getPlatformBadgeClasses,
  getPlatformLabel,
  YOUTUBE_DATA_API_KEY_STORAGE_KEY,
} from "@helpers/chat.helper";
@Component({
  selector: "app-settings-modal",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./settings-modal.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModal {
  readonly authorizationService = inject(AuthorizationService);
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly iconsCatalog = inject(IconsCatalogService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly isOpen = input<boolean>(false);
  readonly closed = output<void>();
  readonly mode = input<"modal" | "page">("modal");

  readonly platforms: PlatformType[] = ["twitch", "kick", "youtube"];
  readonly getPlatformBadgeClasses = getPlatformBadgeClasses;

  newChannelName = "";
  selectedPlatform: PlatformType = "twitch";
  selectedAccountId = "";
  youtubeApiKey = "";

  /** Edit mode state */
  editingChannelId: string | null = null;
  editingChannelName: string = "";

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.youtubeApiKey = localStorage.getItem(YOUTUBE_DATA_API_KEY_STORAGE_KEY) ?? "";
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  saveYoutubeApiKey(): void {
    const trimmed = this.youtubeApiKey.trim();
    if (trimmed) {
      localStorage.setItem(YOUTUBE_DATA_API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(YOUTUBE_DATA_API_KEY_STORAGE_KEY);
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

  getPlatformLbl(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  getChannelNamePlaceholder(): string {
    return this.selectedPlatform === "youtube"
      ? "YouTube live video ID or watch/live URL"
      : "Channel name...";
  }

  /** Refresh emote cache */
  refreshEmoteCache(): void {
    this.iconsCatalog.clearCache();
    // Force reload
    void this.iconsCatalog.ensureGlobalLoaded();
    // Reload all active channels
    this.chatListService.channels().forEach((channel) => {
      if (channel.platform === "twitch") {
        void this.iconsCatalog.ensureChannelLoaded(channel.channelId);
      }
    });
  }
}
