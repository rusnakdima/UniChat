/* sys lib */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChannelAvatarService } from "@services/ui/channel-avatar.service";
import { ChatAccount, PlatformType, PLATFORMS } from "@entities/chat.model";

/* helpers */
import { getPlatformLabel } from "@shared/utils/chat.helper";

interface PlatformConnection {
  platform: PlatformType;
  label: string;
  icon: string;
  connected: boolean;
  username?: string;
  accounts: ChatAccount[];
}

@Component({
  selector: "app-connections-page-view",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./connections-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsPageView {
  readonly authorizationService = inject(AuthorizationService);
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly channelAvatars = inject(ChannelAvatarService);

  readonly platforms = PLATFORMS;

  newChannelName = "";
  selectedPlatform: PlatformType = "twitch";
  selectedAccountId = "";

  editingChannelId: string | null = null;
  editingChannelName = "";

  selectedChannelFilter = signal<PlatformType | "all">("all");

  readonly channels = computed(() => this.chatListService.channels());

  readonly filteredChannels = computed(() => {
    if (this.selectedChannelFilter() === "all") {
      return this.channels();
    }
    return this.channels().filter((ch) => ch.platform === this.selectedChannelFilter());
  });

  readonly connections = computed(() => {
    return this.platforms.map((platform) => {
      const platformAccounts = this.authorizationService
        .accounts()
        .filter((a) => a.platform === platform);
      return {
        platform,
        label: getPlatformLabel(platform),
        icon: this.getPlatformIcon(platform),
        connected: platformAccounts.length > 0,
        username: platformAccounts[0]?.username,
        accounts: platformAccounts,
      };
    });
  });

  getPlatformIcon(platform: PlatformType): string {
    switch (platform) {
      case "twitch":
        return "T";
      case "kick":
        return "K";
      case "youtube":
        return "Y";
      default:
        return "";
    }
  }

  getPlatformColor(platform: PlatformType): string {
    switch (platform) {
      case "twitch":
        return "text-[#9146ff]";
      case "kick":
        return "text-[#53fc18]";
      case "youtube":
        return "text-[#ff0000]";
      default:
        return "";
    }
  }

  authorize(platform: PlatformType): void {
    void this.authorizationService.authorize(platform);
  }

  disconnectAccount(accountId: string, platform: PlatformType): void {
    void this.authorizationService.deauthorizeAccount(accountId, platform);
  }

  getAccountInitial(username: string): string {
    return username?.charAt(0)?.toUpperCase() ?? "?";
  }

  getPlatformAccounts(platform: PlatformType) {
    return this.authorizationService.accounts().filter((a) => a.platform === platform);
  }

  getPlatformBorderClass(platform: PlatformType): string {
    switch (platform) {
      case "twitch":
        return "border-l-[#9146ff]";
      case "kick":
        return "border-l-[#53fc18]";
      case "youtube":
        return "border-l-[#ff0000]";
      default:
        return "";
    }
  }

  getPlatformInitial(platform: PlatformType): string {
    switch (platform) {
      case "twitch":
        return "T";
      case "kick":
        return "K";
      case "youtube":
        return "Y";
      default:
        return "";
    }
  }

  getConnectButtonClass(platform: PlatformType): string {
    switch (platform) {
      case "twitch":
        return "bg-[#9146ff] text-white";
      case "kick":
        return "bg-[#53fc18] text-black";
      case "youtube":
        return "bg-[#ff0000] text-white";
      default:
        return "bg-indigo-600 text-white";
    }
  }

  removeAccount(accountId: string, platform: PlatformType): void {
    void this.authorizationService.deauthorizeAccount(accountId, platform);
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
      this.authorizationService.getAccountByIdSync(this.selectedAccountId)?.username
    );
    this.newChannelName = "";
  }

  removeChannel(channelId: string): void {
    this.chatListService.removeChannel(channelId);
  }

  toggleChannelVisibility(channelId: string): void {
    this.chatListService.toggleChannelVisibility(channelId);
  }

  getAuthorizedAccounts(platform: PlatformType) {
    return this.authorizationService.accounts().filter((account) => account.platform === platform);
  }

  getPlatformLbl(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  getChannelNamePlaceholder(): string {
    return this.selectedPlatform === "youtube"
      ? "YouTube live video ID or watch/live URL"
      : "Channel name...";
  }

  startEditChannel(channelId: string, currentName: string): void {
    this.editingChannelId = channelId;
    this.editingChannelName = currentName;
  }

  saveEditChannel(): void {
    if (!this.editingChannelId || !this.editingChannelName.trim()) {
      return;
    }
    this.chatListService.updateChannelName(this.editingChannelId, this.editingChannelName.trim());
    this.editingChannelId = null;
    this.editingChannelName = "";
  }

  cancelEditChannel(): void {
    this.editingChannelId = null;
    this.editingChannelName = "";
  }
}
