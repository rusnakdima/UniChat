import { inject, Injectable } from "@angular/core";
import { ChatMessage, MessageType, PlatformType } from "@models/chat.model";
import { createMessageActionState } from "@helpers/chat.helper";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { MessageTypeDetectorService } from "@services/ui/message-type-detector.service";

export interface PlatformChatConfig {
  server?: string;
  port?: number;
  apiKey?: string;
}

export interface MockMessageTemplate {
  author: string;
  text: string;
  badges: string[];
}

@Injectable({
  providedIn: "root",
})
export abstract class BaseChatProviderService {
  protected readonly chatStorageService = inject(ChatStorageService);
  protected readonly authorizationService = inject(AuthorizationService);
  protected readonly messageTypeDetector = inject(MessageTypeDetectorService);

  abstract readonly platform: PlatformType;
  protected connectedChannels = new Set<string>();

  connect(channelId: string): void {
    if (this.connectedChannels.has(channelId)) {
      return;
    }

    this.connectedChannels.add(channelId);
    setTimeout(() => {
      this.simulateIncomingMessages(channelId);
    }, 1000);
  }

  disconnect(channelId: string): void {
    this.connectedChannels.delete(channelId);
  }

  isConnected(channelId: string): boolean {
    return this.connectedChannels.has(channelId);
  }

  protected abstract getMockMessages(): MockMessageTemplate[];

  protected abstract getActionStates(): {
    reply: ReturnType<typeof createMessageActionState>;
    delete: ReturnType<typeof createMessageActionState>;
  };

  private simulateIncomingMessages(channelId: string): void {
    if (!this.connectedChannels.has(channelId)) {
      return;
    }

    const mockMessages = this.getMockMessages();

    for (const mockMsg of mockMessages) {
      if (!this.connectedChannels.has(channelId)) {
        break;
      }

      setTimeout(
        () => {
          if (!this.connectedChannels.has(channelId)) {
            return;
          }

          const message = this.createMessage(channelId, mockMsg);
          this.chatStorageService.addMessage(channelId, message);
        },
        Math.random() * 5000 + 2000
      );
    }
  }

  protected createMessage(channelId: string, data: Partial<ChatMessage>): ChatMessage {
    const timestamp = new Date().toISOString();
    const userId = data.sourceUserId ?? `${this.platform}-user-${Date.now()}`;
    const sourceMessageId = data.sourceMessageId ?? `${this.platform}-${channelId}-${Date.now()}`;
    const messageId = data.id ?? sourceMessageId;
    const actionStates = this.getActionStates();

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
        reply: data.actions?.reply ?? actionStates.reply,
        delete: data.actions?.delete ?? actionStates.delete,
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
