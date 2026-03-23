import { Injectable, computed, inject, signal } from "@angular/core";
import {
  ChatChannel,
  ChatMessage,
  MessageAction,
  MessageActionKind,
  PlatformType,
} from "@models/chat.model";
import {
  buildSplitFeed,
  createMessageActionState,
  getProviderCapabilities,
  sortMessagesByRecency,
} from "@helpers/chat.helper";
import { mockMessages } from "@views/dashboard-view/dashboard.mock";
import { ChatListService } from "@services/data/chat-list.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatStorageService } from "@services/data/chat-storage.service";

@Injectable({
  providedIn: "root",
})
export class ChatStateService {
  private readonly chatListService = inject(ChatListService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly chatStorageService = inject(ChatStorageService);

  readonly messages = computed(() => this.chatStorageService.allMessages());

  readonly splitFeed = computed(() => buildSplitFeed(this.messages()));

  constructor() {
    this.initializeMockMessages();
  }

  private initializeMockMessages(): void {
    const messagesByChannel: Record<string, ChatMessage[]> = {};

    for (const message of mockMessages) {
      const channelId = message.sourceChannelId;

      if (!messagesByChannel[channelId]) {
        messagesByChannel[channelId] = [];
      }

      messagesByChannel[channelId].push(message);
    }

    for (const [channelId, messages] of Object.entries(messagesByChannel)) {
      this.chatStorageService.addMessages(channelId, messages);
    }
  }

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.chatStorageService.getMessagesByChannel(channelId);
  }

  getMessagesByPlatform(platform: PlatformType): ChatMessage[] {
    return this.chatStorageService.getMessagesByPlatform(platform);
  }

  submitReply(messageId: string, text: string): void {
    const message = this.messages().find((msg) => msg.id === messageId);

    if (!message || !text.trim()) {
      return;
    }

    if (message.actions.reply.status !== "available") {
      this.updateMessageAction(messageId, "reply", {
        status: "failed",
        reason: message.actions.reply.reason ?? "Reply is unavailable.",
      });

      return;
    }

    const replyMessage: ChatMessage = {
      ...message,
      id: `reply-${message.id}-${Date.now()}`,
      sourceMessageId: `reply-${message.sourceMessageId}`,
      author: "You",
      text: text.trim(),
      timestamp: new Date().toISOString(),
      badges: ["operator"],
      isSupporter: false,
      isOutgoing: true,
      isDeleted: false,
      replyToMessageId: message.id,
      actions: {
        reply: createMessageActionState("reply", "disabled", "Outgoing reply"),
        delete: createMessageActionState(
          "delete",
          message.actions.delete.status,
          message.actions.delete.reason
        ),
      },
      rawPayload: {
        ...message.rawPayload,
        providerEvent: "outgoing_reply",
        preview: text.trim(),
      },
    };

    this.chatStorageService.addMessage(message.sourceChannelId, replyMessage);
  }

  sendOutgoingChatMessage(channelId: string, platform: PlatformType, text: string): void {
    const trimmed = text.trim();

    if (!trimmed || !channelId) {
      return;
    }

    const channels = this.chatListService.getVisibleChannels();
    const channel = channels.find((c) => c.channelId === channelId && c.platform === platform);

    if (!channel) {
      return;
    }

    const id = `out-${platform}-${channelId}-${Date.now()}`;
    const outgoing: ChatMessage = {
      id,
      platform,
      sourceMessageId: id,
      sourceChannelId: channelId,
      sourceUserId: "local-user",
      author: "You",
      text: trimmed,
      timestamp: new Date().toISOString(),
      badges: ["operator"],
      isSupporter: false,
      isOutgoing: true,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: createMessageActionState("reply", "disabled", "Cannot reply to own message"),
        delete: createMessageActionState("delete", "available"),
      },
      rawPayload: {
        providerEvent: "outgoing_send",
        providerChannelId: channelId,
        providerUserId: "local-user",
        preview: trimmed.slice(0, 120),
      },
    };

    this.chatStorageService.addMessage(channelId, outgoing);
    this.refreshMessageCapabilities();
  }

  deleteMessage(messageId: string): void {
    const message = this.messages().find((msg) => msg.id === messageId);

    if (!message) {
      return;
    }

    if (message.actions.delete.status !== "available") {
      this.updateMessageAction(messageId, "delete", {
        status: "failed",
        reason: message.actions.delete.reason ?? "Delete is unavailable.",
      });

      return;
    }

    this.chatStorageService.updateMessage(message.sourceChannelId, messageId, {
      text: "Message removed from view.",
      isDeleted: true,
      actions: {
        ...message.actions,
        delete: createMessageActionState(
          "delete",
          "disabled",
          "Already deleted in the local session."
        ),
      },
    });
  }

  refreshMessageCapabilities(): void {
    const channels = this.chatListService.getVisibleChannels();
    const allMessages = this.messages();

    for (const message of allMessages) {
      const channel = channels.find((ch) => ch.channelId === message.sourceChannelId);

      if (!channel) {
        continue;
      }

      const isAuthorized = this.authorizationService.isAuthorized(channel.platform);
      const capabilities = getProviderCapabilities(channel.platform, isAuthorized);

      this.chatStorageService.updateMessage(message.sourceChannelId, message.id, {
        actions: {
          reply: createMessageActionState(
            "reply",
            capabilities.canReply ? "available" : "disabled",
            capabilities.canReply ? undefined : "This channel is watch-only for replies."
          ),
          delete: createMessageActionState(
            "delete",
            capabilities.canDelete ? "available" : "disabled",
            capabilities.canDelete ? undefined : "This channel cannot delete messages."
          ),
        },
      });
    }
  }

  private updateMessageAction(
    messageId: string,
    kind: MessageActionKind,
    patch: Partial<MessageAction>
  ): void {
    const message = this.messages().find((msg) => msg.id === messageId);

    if (!message) {
      return;
    }

    this.chatStorageService.updateMessage(message.sourceChannelId, messageId, {
      actions: {
        ...message.actions,
        [kind]: {
          ...message.actions[kind],
          ...patch,
        },
      },
    });
  }
}
