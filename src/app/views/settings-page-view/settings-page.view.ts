import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ChatAccount, PlatformType } from "@models/chat.model";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatListService } from "@services/data/chat-list.service";
import {
  getPlatformBadgeClasses,
  getPlatformLabel,
  YOUTUBE_DATA_API_KEY_STORAGE_KEY,
} from "@helpers/chat.helper";

@Component({
  selector: "app-settings-page-view",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./settings-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageView {
  readonly authorizationService = inject(AuthorizationService);
  readonly chatListService = inject(ChatListService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

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
      this.youtubeApiKey = localStorage.getItem(YOUTUBE_DATA_API_KEY_STORAGE_KEY) ?? "";
      this.changeDetectorRef.markForCheck();
    });
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
    void this.authorizationService.deauthorize(platform);
  }

  addChannel(): void {
    if (!this.newChannelName.trim()) {
      return;
    }

    this.chatListService.addChannel(
      this.selectedPlatform,
      this.newChannelName.trim(),
      undefined,
      this.selectedAccountId || undefined
    );
    this.newChannelName = "";
  }

  removeChannel(channelId: string): void {
    this.chatListService.removeChannel(channelId);
  }

  toggleChannelVisibility(channelId: string): void {
    this.chatListService.toggleChannelVisibility(channelId);
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
      ? "@handle, channel URL, or Studio / watch link"
      : "Channel name...";
  }
}
