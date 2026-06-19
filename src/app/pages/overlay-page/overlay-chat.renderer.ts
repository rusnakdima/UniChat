import {
  DensityMode,
  PlatformType,
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
  ChatMessage,
  ChatMessageEmote,
} from "@entities/chat.model";
import { YouTubeChannelInfo } from "@entities/platform-api.model";
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatRichTextService, ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { OverlayChatMessage } from "@services/ui/overlay-ws-state.service";
import { ChannelImageLoaderService } from "@services/ui/channel-image-loader.service";
import { buildChannelRef, findChannelByRef } from "@utils/channel-ref.util";
import {
  getDensityTextClasses,
  getPlatformBadgeClasses,
  getPlatformLabel,
  isSafeRemoteImageUrl,
} from "@shared/utils/chat.helper";
import { inject, signal, computed, ChangeDetectorRef } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";

export class OverlayChatRenderer {
  readonly chatList = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly richText = inject(ChatRichTextService);
  readonly avatarCache = inject(AvatarCacheService);
  readonly twitchChat = inject(TwitchChatService);
  readonly kickChat = inject(KickChatService);
  readonly authService = inject(AuthorizationService);
  readonly channelImageLoader = inject(ChannelImageLoaderService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tauriApi = inject(TauriApiService);

  private readonly pendingUserAvatarLoads = new Set<string>();
  private readonly pendingChannelAvatarLoads = new Set<string>();
  private readonly brokenEmoteUrls = new Set<string>();

  readonly customCssText = signal<string>("");
  readonly textSize = signal<number>(16);
  readonly animationType = signal<OverlayAnimationType>("fade");
  readonly animationDirection = signal<OverlayDirection>("top");
  readonly maxMessages = signal<number>(6);
  readonly transparentBg = signal<boolean>(true);

  readonly backgroundColor = computed(() => {
    return this.transparentBg() ? "transparent" : "rgba(0, 0, 0, 1)";
  });

  private currentChannelIds: string[] | undefined = undefined;

  hasMultipleChannels(): boolean {
    return (this.currentChannelIds?.length ?? 0) > 1;
  }

  setCurrentChannelIds(channelIds: string[] | undefined): void {
    this.currentChannelIds = channelIds;
  }

  shouldShowPlatformIcon(message: OverlayChatMessage): boolean {
    return this.hasMultipleChannels() && !!this.presentation.platformIconUrl(message.platform);
  }

  shouldShowChannelImage(message: OverlayChatMessage): boolean {
    return this.hasMultipleChannels() && !!this.getChannelImageUrl(message);
  }

  shouldShowUserImage(message: OverlayChatMessage): boolean {
    return !!this.getUserImageUrl(message);
  }

  shouldShowAuthorInitial(message: OverlayChatMessage): boolean {
    return !this.hasMultipleChannels() && !this.shouldShowUserImage(message);
  }

  channelInitial(message: OverlayChatMessage): string {
    return this.channelTitle(message).trim().charAt(0).toUpperCase();
  }

  authorInitial(message: OverlayChatMessage): string {
    return message.author.trim().charAt(0).toUpperCase();
  }

  shouldShowPlatformContextIcon(): boolean {
    return this.hasMultipleChannels();
  }

  ensureAvatarCachesForMessages(messages: readonly OverlayChatMessage[]): boolean {
    let changed = false;

    for (const message of messages) {
      if (message.sourceChannelId) {
        const channelCacheKey = this.channelAvatarCacheKey(message);

        if (isSafeRemoteImageUrl(message.channelImageUrl)) {
          const directUrl = message.channelImageUrl!.trim();
          if (!this.avatarCache.hasChannelAvatar(channelCacheKey)) {
            this.avatarCache.setChannelAvatar(channelCacheKey, directUrl);
            changed = true;
          }
        }

        if (!this.avatarCache.hasChannelAvatar(channelCacheKey)) {
          const channel = findChannelByRef(
            this.chatList.getChannels(message.platform),
            buildChannelRef(message.platform, message.sourceChannelId)
          );

          if (channel && isSafeRemoteImageUrl(channel.channelImageUrl)) {
            const imageUrl = channel.channelImageUrl!.trim();
            this.avatarCache.setChannelAvatar(channelCacheKey, imageUrl);
            changed = true;
          } else if (!this.pendingChannelAvatarLoads.has(channelCacheKey)) {
            if (
              channel &&
              (message.platform === "twitch" ||
                message.platform === "kick" ||
                message.platform === "youtube")
            ) {
              this.pendingChannelAvatarLoads.add(channelCacheKey);
              void this.fetchAvatar(
                message.platform,
                channel.channelName,
                channelCacheKey,
                "channel"
              );
            }
          }
        }
      }

      const userCacheKey = this.userAvatarCacheKey(message);

      if (isSafeRemoteImageUrl(message.authorAvatarUrl)) {
        const directUrl = message.authorAvatarUrl!.trim();
        if (!this.avatarCache.hasUserAvatar(userCacheKey)) {
          this.avatarCache.setUserAvatar(userCacheKey, directUrl);
          changed = true;
        }
      }

      if (
        !this.avatarCache.hasUserAvatar(userCacheKey) &&
        !isSafeRemoteImageUrl(message.authorAvatarUrl)
      ) {
        if (!this.pendingUserAvatarLoads.has(userCacheKey)) {
          this.pendingUserAvatarLoads.add(userCacheKey);
          if (message.platform === "twitch" || message.platform === "kick") {
            void this.fetchAvatar(message.platform, message.author, userCacheKey, "user");
          }
        }
      }
    }

    return changed;
  }

  isEmoteUrlBroken(url: string | undefined | null): boolean {
    return !!url && this.brokenEmoteUrls.has(url);
  }

  onEmoteImageError(url: string | undefined | null): void {
    if (!url) {
      return;
    }
    if (!this.brokenEmoteUrls.has(url)) {
      this.brokenEmoteUrls.add(url);
      this.cdr.markForCheck();
    }
  }

  getChannelImageUrl(message: OverlayChatMessage): string | null {
    if (!message.sourceChannelId) {
      return null;
    }

    if (isSafeRemoteImageUrl(message.channelImageUrl)) {
      return message.channelImageUrl!.trim();
    }

    const cacheKey = this.channelAvatarCacheKey(message);
    const cached = this.avatarCache.getChannelAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    const channel = this.chatList
      .getChannels(message.platform)
      .find((ch) => ch.channelId === message.sourceChannelId);

    if (channel?.channelImageUrl) {
      return channel.channelImageUrl;
    }

    return null;
  }

  getUserImageUrl(message: OverlayChatMessage): string | null {
    const cacheKey = this.userAvatarCacheKey(message);

    if (isSafeRemoteImageUrl(message.authorAvatarUrl)) {
      return message.authorAvatarUrl!.trim();
    }

    return this.avatarCache.getUserAvatar(cacheKey) ?? null;
  }

  private async fetchAvatar(
    platform: string,
    fetchId: string,
    cacheKey: string,
    type: "channel" | "user"
  ): Promise<void> {
    try {
      let imageUrl: string | null = null;

      if (platform === "twitch") {
        imageUrl = await this.twitchChat.fetchUserProfileImage(fetchId);
      } else if (platform === "kick") {
        const info = await this.kickChat.fetchUserInfo(fetchId);
        imageUrl = info?.profile_pic_url ?? null;
      } else if (platform === "youtube" && type === "channel") {
        const account = this.authService.getPrimaryAccount("youtube");
        if (account?.accessToken) {
          const info = await this.tauriApi.invoke<YouTubeChannelInfo>("youtubeFetchChannelInfo", {
            channelName: fetchId,
            accessToken: account.accessToken,
          });
          imageUrl = info?.thumbnailUrl ?? null;
        }
      }

      if (imageUrl) {
        if (type === "channel") {
          this.avatarCache.setChannelAvatar(cacheKey, imageUrl);
        } else {
          this.avatarCache.setUserAvatar(cacheKey, imageUrl);
        }
      }
    } catch {
      // Ignore errors - avatar images are optional
    } finally {
      if (type === "channel") {
        this.pendingChannelAvatarLoads.delete(cacheKey);
      } else {
        this.pendingUserAvatarLoads.delete(cacheKey);
      }
      this.cdr.markForCheck();
    }
  }

  channelTitle(message: OverlayChatMessage): string {
    const channel = this.chatList
      .getChannels(message.platform)
      .find((item) => item.channelId === message.sourceChannelId);
    return channel?.channelName ?? message.sourceChannelId ?? this.platformLabel(message.platform);
  }

  messageTimeLabel(message: OverlayChatMessage): string {
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  platformLabel(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  platformBadgeClasses(platform: PlatformType): string {
    return `${getPlatformBadgeClasses(platform)} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]`;
  }

  densityTextClasses(densityMode: DensityMode): string {
    return getDensityTextClasses(densityMode);
  }

  overlayMessages(messages: readonly OverlayChatMessage[]): OverlayChatMessage[] {
    const channelRefs = this.extractChannelIdsFromSelection(this.currentChannelIds);

    if (this.currentChannelIds !== undefined && this.currentChannelIds !== null) {
      if (this.currentChannelIds.length === 0) {
        return [];
      }
      const filtered = messages.filter((msg) => {
        const channelRef = buildChannelRef(msg.platform, msg.sourceChannelId || "");
        return channelRefs!.includes(channelRef);
      });
      return filtered.slice(0, this.maxMessages());
    }

    return messages.slice(0, this.maxMessages());
  }

  orderedMessages(messages: OverlayChatMessage[]): OverlayChatMessage[] {
    const direction = this.animationDirection();

    if (direction === "bottom" || direction === "right") {
      return [...messages].reverse();
    }

    return messages;
  }

  animationCss(): string {
    const type = this.animationType();
    const dir = this.animationDirection();

    if (type === "none") {
      return "";
    }

    let transformStart = "";
    let transformEnd = "translate(0, 0)";

    switch (dir) {
      case "top":
        transformStart = "translateY(-100%)";
        break;
      case "bottom":
        transformStart = "translateY(100%)";
        break;
      case "left":
        transformStart = "translateX(-100%)";
        break;
      case "right":
        transformStart = "translateX(100%)";
        break;
    }

    const animId = `anim-${type}-${dir}`;

    if (type === "fade") {
      return `
        @keyframes ${animId}-fade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .message-item {
          animation: ${animId}-fade 0.4s ease-out forwards;
        }
      `;
    }

    if (type === "slide") {
      return `
        @keyframes ${animId}-slide {
          0% { opacity: 0; transform: ${transformStart}; }
          100% { opacity: 1; transform: ${transformEnd}; }
        }
        .message-item {
          animation: ${animId}-slide 0.4s ease-out forwards;
        }
      `;
    }

    if (type === "pop") {
      return `
        @keyframes ${animId}-pop {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .message-item {
          animation: ${animId}-pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        }
      `;
    }

    return "";
  }

  getMessageSegments(message: OverlayChatMessage): ChatTextSegment[] {
    const chatMessage: ChatMessage = {
      id: message.id,
      platform: message.platform as PlatformType,
      sourceMessageId: message.id,
      sourceChannelId: message.sourceChannelId || "",
      sourceUserId: message.author,
      author: message.author,
      text: message.text,
      timestamp: String(message.timestamp),
      badges: [],
      isSupporter: message.isSupporter ?? false,
      isOutgoing: false,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { status: "disabled", kind: "reply" },
        delete: { status: "disabled", kind: "delete" },
      },
      rawPayload: {
        emotes: Array.from(message.emotes?.values() ?? []) as ChatMessageEmote[],
        badgeIcons: [],
        providerEvent: "",
        providerChannelId: message.sourceChannelId || "",
        providerUserId: message.author,
        preview: message.text,
      },
      authorAvatarUrl: message.authorAvatarUrl,
    };

    return this.richText.buildSegments(chatMessage.text);
  }

  messagesContainerClasses(): string {
    return "flex-col";
  }

  messageFullTimeLabel(message: OverlayChatMessage): string {
    return new Date(message.timestamp).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  private channelAvatarCacheKey(message: OverlayChatMessage): string {
    return `${message.platform}:${message.sourceChannelId ?? ""}`;
  }

  private userAvatarCacheKey(message: OverlayChatMessage): string {
    return `${message.platform}:${message.sourceChannelId ?? ""}:${message.author.trim().toLowerCase()}`;
  }

  private extractChannelIdsFromSelection(channelIds: string[] | undefined): string[] | undefined {
    if (channelIds === undefined) {
      return undefined;
    }
    return [...channelIds].sort();
  }
}
