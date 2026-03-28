/* sys lib */
import { NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ChatListService } from "@services/data/chat-list.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { ChatRichTextService } from "@services/ui/chat-rich-text.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { LinkPreviewService } from "@services/ui/link-preview.service";
import { MessageTypeStylingService } from "@services/ui/message-type-styling.service";
import { PinnedMessagesService } from "@services/ui/pinned-messages.service";
import { UserProfilePopoverService } from "@services/ui/user-profile-popover.service";

/* helpers */
import { isSafeRemoteImageUrl, silenceBrokenChatImage } from "@helpers/chat.helper";
@Component({
  selector: "app-chat-message-card",
  standalone: true,
  imports: [NgClass, MatIconModule, MatTooltipModule],
  templateUrl: "./chat-message-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageCardComponent {
  private static readonly blockedBadgeUrls = new Set<string>();

  readonly message = input.required<ChatMessage>();
  readonly highlighted = input(false);
  /** When set (e.g. mixed feed), shown before the platform badge to separate streams. */
  readonly channelLabel = input<string | undefined>(undefined);

  readonly presentation = inject(ChatMessagePresentationService);
  readonly richText = inject(ChatRichTextService);
  readonly linkPreview = inject(LinkPreviewService);
  readonly interactions = inject(DashboardChatInteractionService);
  readonly userProfilePopover = inject(UserProfilePopoverService);
  readonly messageTypeStyling = inject(MessageTypeStylingService);
  readonly pinnedMessagesService = inject(PinnedMessagesService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly chatListService = inject(ChatListService);
  private readonly avatarCache = inject(AvatarCacheService);

  readonly isSafeRemoteImageUrl = isSafeRemoteImageUrl;

  /** Get message type from message or default to "regular" */
  getMessageType(): import("@models/chat.model").MessageType {
    return this.message().messageType ?? "regular";
  }

  /** Get message type styling config */
  getMessageTypeConfig() {
    const type = this.getMessageType();
    return this.messageTypeStyling.getMessageTypeConfig(type, this.message().messageTypeReason);
  }

  /** Get combined ngClass object for message styling */
  getMessageClasses() {
    const typeConfig = this.getMessageTypeConfig();
    const highlightColor = this.presentation.getHighlightColor(this.message());

    return {
      // Base highlighted state (from user interaction)
      "border-emerald-500": this.highlighted(),
      "ring-2": this.highlighted(),
      "ring-emerald-400/70": this.highlighted(),
      "shadow-md": this.highlighted(),
      // Highlight from rules
      "border-l-4": highlightColor !== null,
      // Default border when not highlighted
      "border-slate-200": !this.highlighted() && !typeConfig.cssClass && highlightColor === null,
      "dark:border-white/10":
        !this.highlighted() && !typeConfig.cssClass && highlightColor === null,
      // Message type classes
      [typeConfig.cssClass]: !!typeConfig.cssClass,
      [typeConfig.animationClass]: !!typeConfig.animationClass,
    };
  }

  /** Get inline style for highlight color */
  getMessageStyles(): { [key: string]: string } {
    const highlightColor = this.presentation.getHighlightColor(this.message());
    if (highlightColor) {
      return {
        "border-left-color": highlightColor,
        "background-color": this.hexToRgba(highlightColor, 0.08),
      };
    }
    return {};
  }

  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
  }

  /** Cache for user profile images by sourceUserId */
  private static userImageCache = new Map<string, string>();

  /** Cache for channel profile images by channelId */
  private static channelImageCache = new Map<string, string>();

  /** Get user profile image URL */
  async getUserImageUrl(): Promise<string | null> {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceUserId}`;

    // Check centralized cache first
    const cached = this.avatarCache.getUserAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    // For Kick and YouTube, avatar is already set in the message
    if (msg.authorAvatarUrl) {
      this.avatarCache.setUserAvatar(cacheKey, msg.authorAvatarUrl);
      return msg.authorAvatarUrl;
    }

    // For Twitch, fetch from CDN
    if (msg.platform === "twitch") {
      try {
        const imageUrl = await this.twitchChat.fetchUserProfileImage(msg.author);
        if (imageUrl) {
          this.avatarCache.setUserAvatar(cacheKey, imageUrl);
          return imageUrl;
        }
      } catch {
        // Ignore all errors - profile images are optional
      }
    }

    return null;
  }

  /** Check if user image is cached */
  hasUserImage(): boolean {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceUserId}`;
    return this.avatarCache.hasUserAvatar(cacheKey);
  }

  /** Get cached user image URL */
  getCachedUserImage(): string | null {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceUserId}`;
    return this.avatarCache.getUserAvatar(cacheKey) ?? null;
  }

  /** Load user image on demand */
  loadUserImage(): void {
    if (!this.hasUserImage()) {
      void this.getUserImageUrl();
    }
  }

  /** Get channel profile image URL (loads on demand for Twitch) */
  async getChannelImageUrl(): Promise<string | null> {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceChannelId}`;

    // Check centralized cache first
    const cached = this.avatarCache.getChannelAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to get channel info from ChatListService
    const channel = this.chatListService
      .getChannels(msg.platform)
      .find((ch) => ch.channelId === msg.sourceChannelId);

    if (channel && channel.platform === "twitch") {
      try {
        // Fetch channel profile image from decapi.me (public API, no auth required)
        const imageUrl = await this.twitchChat.fetchUserProfileImage(channel.channelName);
        if (imageUrl) {
          this.avatarCache.setChannelAvatar(cacheKey, imageUrl);
          return imageUrl;
        }
      } catch {
        // Ignore all errors - channel images are optional
        // Public APIs may be rate limited or unavailable
      }
    }

    return null;
  }

  /** Check if channel image is cached */
  hasChannelImage(): boolean {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceChannelId}`;
    return this.avatarCache.hasChannelAvatar(cacheKey);
  }

  /** Get cached channel image URL */
  getCachedChannelImage(): string | null {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceChannelId}`;
    return this.avatarCache.getChannelAvatar(cacheKey) ?? null;
  }

  /** Load channel image on demand */
  loadChannelImage(): void {
    if (!this.hasChannelImage()) {
      void this.getChannelImageUrl();
    }
  }

  visibleBadgeIcons() {
    const icons = this.message().rawPayload.badgeIcons ?? [];
    return icons.filter((icon) => {
      if (!isSafeRemoteImageUrl(icon.url)) {
        return false;
      }
      return !ChatMessageCardComponent.blockedBadgeUrls.has(icon.url);
    });
  }

  onBadgeIconError(url: string, event: Event): void {
    ChatMessageCardComponent.blockedBadgeUrls.add(url);
    silenceBrokenChatImage(event);
  }

  onEmoteImageError(event: Event): void {
    silenceBrokenChatImage(event);
  }

  onLinkClick(segment: ChatTextSegment, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (segment.type !== "link" || !segment.href) {
      return;
    }
    this.linkPreview.openResolved(segment.value, segment.href);
  }

  onUsernameClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    if (!(el instanceof HTMLElement)) {
      return;
    }
    this.userProfilePopover.toggle(el, this.message());
  }

  /** Check if current message is pinned */
  get isPinned(): boolean {
    return this.pinnedMessagesService.isPinned(this.message().id);
  }

  /** Toggle pin state for current message */
  togglePin(): void {
    if (this.isPinned) {
      this.pinnedMessagesService.unpinByMessageId(this.message().id);
    } else {
      this.pinnedMessagesService.pinMessage(this.message());
    }
  }
}
