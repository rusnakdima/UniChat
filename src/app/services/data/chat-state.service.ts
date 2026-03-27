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
import { ChatListService } from "@services/data/chat-list.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";

@Injectable({
  providedIn: "root",
})
export class ChatStateService {
  private readonly chatListService = inject(ChatListService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly chatStorageService = inject(ChatStorageService);
  private readonly providerCoordinator = inject(ChatProviderCoordinatorService);

  readonly messages = computed(() => this.chatStorageService.allMessages());

  readonly splitFeed = computed(() => buildSplitFeed(this.messages()));

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

  async sendOutgoingChatMessage(
    channelId: string,
    platform: PlatformType,
    text: string
  ): Promise<void> {
    const trimmed = text.trim();

    if (!trimmed || !channelId) {
      return;
    }

    const channels = this.chatListService.getVisibleChannels();
    const channel = channels.find((c) => c.channelId === channelId && c.platform === platform);

    if (!channel) {
      return;
    }

    const sentToProvider = await this.providerCoordinator.sendMessage(channelId, platform, trimmed);
    if (platform === "twitch" && sentToProvider) {
      // Twitch IRC echoes own message back; avoid duplicate local synthetic message.
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
        delete: createMessageActionState(
          "delete",
          sentToProvider ? "available" : "disabled",
          sentToProvider ? undefined : "Provider send failed or channel is not connected."
        ),
      },
      rawPayload: {
        providerEvent: sentToProvider ? "outgoing_send" : "outgoing_send_failed",
        providerChannelId: channelId,
        providerUserId: "local-user",
        preview: trimmed.slice(0, 120),
      },
    };

    this.chatStorageService.addMessage(channelId, outgoing);
    this.refreshMessageCapabilities();
  }

  async deleteMessage(messageId: string): Promise<void> {
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

    const channels = this.chatListService.getVisibleChannels();
    const channel = channels.find((ch) => ch.channelId === message.sourceChannelId);
    const platform = channel?.platform ?? message.platform;

    await this.providerCoordinator.deleteMessage(
      message.sourceChannelId,
      platform,
      message.sourceMessageId
    );

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

      const account = channel.accountId
        ? this.authorizationService.accounts().find((item) => item.id === channel.accountId)
        : undefined;
      const isAuthorized = channel.isAuthorized && !!account;
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
