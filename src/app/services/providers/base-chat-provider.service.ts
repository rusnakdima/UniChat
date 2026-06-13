/* sys lib */
import { inject, Injectable } from "@angular/core";

/* models */
import { ChannelAccountCapabilities, ChatMessage, PlatformType } from "@models/chat.model";

/* services */
import { PlatformResolverService } from "@services/core/platform-resolver.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { MessageTypeDetectorService } from "@services/ui/message-type-detector.service";

/* helpers */
import { createMessageActionState, generateTimestamp } from "@helpers/chat.helper";
export interface PlatformChatConfig {
  server?: string;
  port?: number;
  apiKey?: string;
}

@Injectable({
  providedIn: "root",
})
export abstract class BaseChatProviderService {
  protected readonly platformResolver = inject(PlatformResolverService);
  protected readonly chatStorageService = inject(ChatStorageService);
  protected readonly chatListService = inject(ChatListService);
  protected readonly authorizationService = inject(AuthorizationService);
  protected readonly messageTypeDetector = inject(MessageTypeDetectorService);

  abstract readonly platform: PlatformType;
  protected connectedChannels = new Set<string>();

  connect(channelId: string): void {
    if (this.connectedChannels.has(channelId)) {
      return;
    }

    this.connectedChannels.add(channelId);
  }

  disconnect(channelId: string): void {
    this.connectedChannels.delete(channelId);
  }

  isConnected(channelId: string): boolean {
    return this.connectedChannels.has(channelId);
  }

  protected abstract getActionStates(): {
    reply: ReturnType<typeof createMessageActionState>;
    delete: ReturnType<typeof createMessageActionState>;
  };

  public createMessage(channelId: string, data: Partial<ChatMessage>): ChatMessage {
    const timestamp = generateTimestamp();
    const userId = data.sourceUserId ?? `${this.platform}-user-${Date.now()}`;
    const sourceMessageId = data.sourceMessageId ?? `${this.platform}-${channelId}-${Date.now()}`;
    const messageId = data.id ?? sourceMessageId;
    const actionStates = this.getActionStates();
    const channel = this.chatListService
      .getChannels(this.platform)
      .find((entry) => entry.channelId === channelId);
    // Note: Uses sync version - accounts are loaded when channels are connected
    const account = this.authorizationService.getAccountByIdSync(channel?.accountId);
    const isAuthorized = account?.authStatus === "authorized";
    const base =
      isAuthorized && channel
        ? this.platformResolver.getCapabilities(channel.platform)
        : { canListen: true, canReply: false, canDelete: false };

    const moderation = channel?.accountCapabilities;

    const capabilities: ChannelAccountCapabilities | undefined = channel
      ? {
          ...base,
          canDelete: base.canDelete && moderation?.verified === true && moderation.canDelete,
          canModerate: moderation?.verified === true && moderation.canModerate,
          moderationRole: moderation?.moderationRole ?? "viewer",
          verified: moderation?.verified ?? false,
        }
      : undefined;

    const baseMessage: ChatMessage = {
      id: messageId,
      platform: this.platform,
      sourceMessageId,
      sourceChannelId: channelId,
      sourceUserId: userId,
      author: data.author ?? "Anonymous",
      text: data.text ?? "",
      timestamp: data.timestamp ?? timestamp,
      badges: data.badges ?? [],
      isSupporter: this.isSupporter(data.badges),
      isOutgoing: data.isOutgoing ?? false,
      isDeleted: data.isDeleted ?? false,
      canRenderInOverlay: data.canRenderInOverlay ?? true,
      replyToMessageId: data.replyToMessageId,
      actions: {
        reply:
          data.actions?.reply ??
          createMessageActionState(
            "reply",
            capabilities?.canReply ? "available" : actionStates.reply.status,
            capabilities?.canReply ? undefined : actionStates.reply.reason
          ),
        delete:
          data.actions?.delete ??
          createMessageActionState(
            "delete",
            capabilities?.canDelete ? "available" : actionStates.delete.status,
            capabilities?.canDelete ? undefined : actionStates.delete.reason
          ),
      },
      rawPayload: data.rawPayload ?? {
        providerEvent: this.getProviderEventName(),
        providerChannelId: channelId,
        providerUserId: userId,
        preview: data.text ?? "",
      },
      authorAvatarUrl: data.authorAvatarUrl,
    };

    // Detect and assign message type
    const { type, reason } = this.messageTypeDetector.detectMessageType(baseMessage);
    baseMessage.messageType = type;
    baseMessage.messageTypeReason = reason;

    // Update last message time for future detection
    this.messageTypeDetector.updateLastMessageTime(baseMessage);

    return baseMessage;
  }

  protected isSupporter(badges?: string[]): boolean {
    const supporterBadges = ["subscriber", "supporter", "member"];
    return badges?.some((badge) => supporterBadges.includes(badge)) ?? false;
  }

  protected getProviderEventName(): string {
    switch (this.platform) {
      case "twitch":
        return "privmsg";
      case "kick":
        return "chat.message";
      case "youtube":
        return "liveChatMessage";
    }
  }
}
