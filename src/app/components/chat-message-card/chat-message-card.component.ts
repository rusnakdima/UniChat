/* sys lib */
import { NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

/* models */
import { ChatMessage } from "@entities/chat.model";

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { ChatRichTextService } from "@services/ui/chat-rich-text.service";
import { DashboardChatInteractionService } from "@services/ui/dashboard-chat-interaction.service";
import { LinkPreviewService } from "@services/ui/link-preview.service";
import { MessageTypeStylingService } from "@services/ui/message-type-styling.service";
import { PinnedMessagesService } from "@services/ui/pinned-messages.service";
import { UserProfilePopoverService } from "@services/ui/user-profile-popover.service";
import { ChannelAvatarService } from "@services/ui/channel-avatar.service";

/* helpers */
import { isSafeRemoteImageUrl, silenceBrokenChatImage } from "@shared/utils/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";
@Component({
  selector: "app-chat-message-card",
  standalone: true,
  imports: [NgClass, MatIconModule, MatTooltipModule],
  templateUrl: "./chat-message-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageCardComponent {
  private static readonly blockedBadgeUrls = new Set<string>();
  private static readonly avatarFetchBatchSize = 5;
  private static pendingAvatarFetches: Array<{
    cacheKey: string;
    platform: string;
    userId: string;
    username: string;
    resolve: (url: string | null) => void;
  }> = [];
  private static avatarBatchRafId: number | null = null;
  private static twitchChatRef: TwitchChatService | null = null;
  private static kickChatRef: KickChatService | null = null;
  private static avatarCacheRef: AvatarCacheService | null = null;

  readonly message = input.required<ChatMessage>();
  readonly highlighted = input(false);
  /** When set (e.g. mixed feed), shown before the platform badge to separate streams. */
  readonly channelLabel = input<string | undefined>(undefined);
  /** Number of enabled channels in the dashboard filter - used to determine visibility of platform icon and channel image */
  readonly enabledChannelsCount = input<number>(0);

  private static readonly ALLOWED_BADGE_LABELS = ["moderator", "vip", "announcement", "announcer"];

  readonly presentation = inject(ChatMessagePresentationService);
  readonly richText = inject(ChatRichTextService);
  readonly linkPreview = inject(LinkPreviewService);
  readonly interactions = inject(DashboardChatInteractionService);
  readonly userProfilePopover = inject(UserProfilePopoverService);
  readonly messageTypeStyling = inject(MessageTypeStylingService);
  readonly pinnedMessagesService = inject(PinnedMessagesService);
  readonly channelAvatars = inject(ChannelAvatarService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly kickChat = inject(KickChatService);
  private readonly avatarCache = inject(AvatarCacheService);

  readonly isSafeRemoteImageUrl = isSafeRemoteImageUrl;

  constructor() {
    if (!ChatMessageCardComponent.twitchChatRef) {
      ChatMessageCardComponent.twitchChatRef = inject(TwitchChatService);
      ChatMessageCardComponent.kickChatRef = inject(KickChatService);
      ChatMessageCardComponent.avatarCacheRef = inject(AvatarCacheService);
    }

    effect(() => {
      const msg = this.message();
      this.loadUserImage();
      if (this.enabledChannelsCount() > 1) {
        this.channelAvatars.ensureChannelImage(buildChannelRef(msg.platform, msg.sourceChannelId));
      }
    });
  }

  /** Get message type from message or default to "regular" */
  getMessageType(): import("@entities/chat.model").MessageType {
    return this.message().messageType ?? "regular";
  }

  /** Get message type styling config */
  getMessageTypeConfig() {
    const type = this.getMessageType();
    return this.messageTypeStyling.getMessageTypeConfig(type);
  }

  /** Get combined ngClass object for message styling */
  getMessageClasses() {
    const typeConfig = this.getMessageTypeConfig();
    const highlightColor = this.presentation.getHighlightColor(this.message());
    const classes: { [key: string]: boolean } = {
      "border-emerald-500": this.highlighted(),
      "ring-2": this.highlighted(),
      "ring-emerald-400/70": this.highlighted(),
      "shadow-md": this.highlighted(),
      "border-l-4": highlightColor !== null,
      "border-slate-200": !this.highlighted() && !typeConfig.cssClass && highlightColor === null,
      "dark:border-white/10":
        !this.highlighted() && !typeConfig.cssClass && highlightColor === null,
    };
    if (typeConfig.cssClass) {
      classes[typeConfig.cssClass] = true;
    }
    if (typeConfig.animationClass) {
      classes[typeConfig.animationClass] = true;
    }
    return classes;
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

  /** Get user profile image URL */
  getUserImageUrl(): string | null {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceUserId}`;

    const cached = this.avatarCache.getUserAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    if (msg.authorAvatarUrl) {
      this.avatarCache.setUserAvatar(cacheKey, msg.authorAvatarUrl);
      return msg.authorAvatarUrl;
    }

    return null;
  }

  private static scheduleAvatarBatchFetch(): void {
    if (ChatMessageCardComponent.avatarBatchRafId !== null) {
      return;
    }
    ChatMessageCardComponent.avatarBatchRafId = requestAnimationFrame(() => {
      ChatMessageCardComponent.avatarBatchRafId = null;
      ChatMessageCardComponent.processAvatarBatch();
    });
  }

  private static async processAvatarBatch(): Promise<void> {
    const batch = ChatMessageCardComponent.pendingAvatarFetches.splice(
      0,
      ChatMessageCardComponent.avatarFetchBatchSize
    );
    if (batch.length === 0) {
      return;
    }

    const twitchMessages = batch.filter((m) => m.platform === "twitch");
    const kickMessages = batch.filter((m) => m.platform === "kick");
    const otherMessages = batch.filter((m) => m.platform !== "twitch" && m.platform !== "kick");

    for (const msg of otherMessages) {
      msg.resolve(null);
    }

    const cacheRef = ChatMessageCardComponent.avatarCacheRef;
    if (!cacheRef) {
      for (const msg of [...twitchMessages, ...kickMessages]) {
        msg.resolve(null);
      }
      return;
    }

    if (twitchMessages.length > 0) {
      const chatRef = ChatMessageCardComponent.twitchChatRef;
      if (chatRef) {
        const byUsername = new Map<string, typeof twitchMessages>();
        for (const msg of twitchMessages) {
          const existing = byUsername.get(msg.username);
          if (existing) {
            existing.push(msg);
          } else {
            byUsername.set(msg.username, [msg]);
          }
        }

        const fetchPromises: Promise<void>[] = [];
        for (const [username, msgs] of byUsername) {
          const promise = (async () => {
            try {
              const imageUrl = await chatRef.fetchUserProfileImage(username);
              for (const msg of msgs) {
                if (imageUrl) {
                  cacheRef.setUserAvatar(msg.cacheKey, imageUrl);
                }
                msg.resolve(imageUrl);
              }
            } catch {
              for (const msg of msgs) {
                msg.resolve(null);
              }
            }
          })();
          fetchPromises.push(promise);
        }

        await Promise.all(fetchPromises);
      } else {
        for (const msg of twitchMessages) {
          msg.resolve(null);
        }
      }
    }

    if (kickMessages.length > 0) {
      const chatRef = ChatMessageCardComponent.kickChatRef;
      if (chatRef) {
        const byUsername = new Map<string, typeof kickMessages>();
        for (const msg of kickMessages) {
          const existing = byUsername.get(msg.username);
          if (existing) {
            existing.push(msg);
          } else {
            byUsername.set(msg.username, [msg]);
          }
        }

        const fetchPromises: Promise<void>[] = [];
        for (const [username, msgs] of byUsername) {
          const promise = (async () => {
            try {
              const userInfo = await chatRef.fetchUserInfo(username);
              const imageUrl = userInfo?.profile_pic_url ?? null;
              for (const msg of msgs) {
                if (imageUrl) {
                  cacheRef.setUserAvatar(msg.cacheKey, imageUrl);
                }
                msg.resolve(imageUrl);
              }
            } catch {
              for (const msg of msgs) {
                msg.resolve(null);
              }
            }
          })();
          fetchPromises.push(promise);
        }

        await Promise.all(fetchPromises);
      } else {
        for (const msg of kickMessages) {
          msg.resolve(null);
        }
      }
    }

    if (ChatMessageCardComponent.pendingAvatarFetches.length > 0) {
      ChatMessageCardComponent.scheduleAvatarBatchFetch();
    }
  }

  private static fetchUserImageBatched(
    cacheKey: string,
    platform: string,
    userId: string,
    username: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      ChatMessageCardComponent.pendingAvatarFetches.push({
        cacheKey,
        platform,
        userId,
        username,
        resolve,
      });
      ChatMessageCardComponent.scheduleAvatarBatchFetch();
    });
  }

  /** Load user image on demand with batching */
  loadUserImage(): void {
    const msg = this.message();
    const cacheKey = `${msg.platform}:${msg.sourceUserId}`;

    if (this.avatarCache.hasUserAvatar(cacheKey)) {
      return;
    }

    if (msg.authorAvatarUrl) {
      this.avatarCache.setUserAvatar(cacheKey, msg.authorAvatarUrl);
      return;
    }

    if (msg.platform === "twitch" || msg.platform === "kick") {
      void ChatMessageCardComponent.fetchUserImageBatched(
        cacheKey,
        msg.platform,
        msg.sourceUserId,
        msg.author
      );
    }
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

  loadChannelImage(): void {
    const msg = this.message();
    this.channelAvatars.ensureChannelImage(buildChannelRef(msg.platform, msg.sourceChannelId));
  }

  visibleBadgeIcons() {
    const icons = this.message().rawPayload.badgeIcons ?? [];
    return icons.filter((icon) => {
      if (!isSafeRemoteImageUrl(icon.url)) {
        return false;
      }
      if (ChatMessageCardComponent.blockedBadgeUrls.has(icon.url)) {
        return false;
      }
      const label = icon.label?.toLowerCase() ?? "";
      return ChatMessageCardComponent.ALLOWED_BADGE_LABELS.some((b) => label.includes(b));
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
    this.linkPreview.openResolved(segment.href);
  }

  onUsernameClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    if (!(el instanceof HTMLElement)) {
      return;
    }
    const msg = this.message();
    this.userProfilePopover.show(msg.sourceUserId, el);
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
      this.pinnedMessagesService.pinMessage(this.message().id, this.message().sourceChannelId);
    }
  }

  getPlatformIconUrl(): string {
    return this.presentation.platformIconUrl(this.message().platform);
  }

  getChannelImage(): string | null {
    const msg = this.message();
    if (!this.channelLabel()) {
      return null;
    }
    if (msg.channelImageUrl) {
      return msg.channelImageUrl;
    }
    return this.channelAvatars.getChannelImageForChannel(
      buildChannelRef(msg.platform, msg.sourceChannelId)
    );
  }

  /** Get platform dot color for mobile indicator */
  getPlatformDotColor(): string {
    const platform = this.message().platform;
    switch (platform) {
      case "twitch":
        return "bg-purple-500";
      case "kick":
        return "bg-green-500";
      case "youtube":
        return "bg-red-500";
      default:
        return "bg-slate-400";
    }
  }
}
