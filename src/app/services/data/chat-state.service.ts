/* sys lib */
import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";

/* models */
import {
  ChatChannel,
  ChatMessage,
  MessageAction,
  MessageActionKind,
  PlatformType,
} from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";

/* helpers */
import {
  buildSplitFeed,
  createMessageActionState,
  getChannelAccountCapabilities,
} from "@helpers/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";
/**
 * Chat State Service - Computed State Layer
 *
 * Responsibility: Provides computed signals and business logic for chat state.
 * This is NOT the source of truth - it wraps ChatStorageService with computed values.
 *
 * Source of Truth Hierarchy:
 * 1. ChatStorageService - Primary message storage (owns the data)
 * 2. ChatStateService - Computed state (derived from storage)
 * 3. ChatStateManagerService - Connection tracking (session state)
 * 4. ConnectionStateService - Connection status per channel
 *
 * @see ChatStorageService for data persistence
 * @see ChatStateManagerService for session connection tracking
 * @see ConnectionStateService for connection status
 */
@Injectable({
  providedIn: "root",
})
export class ChatStateService {
  private readonly chatListService = inject(ChatListService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly chatStorageService = inject(ChatStorageService);
  private readonly providerCoordinator = inject(ChatProviderCoordinatorService);

  // Track highlighted message (from search results)
  private readonly highlightedMessageIdSignal = signal<string | null>(null);
  readonly highlightedMessageId = this.highlightedMessageIdSignal.asReadonly();

  readonly messages = computed(() => this.chatStorageService.allMessages());

  readonly splitFeed = computed(() => buildSplitFeed(this.messages()));

  constructor() {
    effect(() => {
      this.chatListService.channels();
      this.authorizationService.accounts();
      untracked(() => this.refreshMessageCapabilities());
    });
  }

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.chatStorageService.getMessagesByChannel(channelId);
  }

  getMessagesByPlatform(platform: PlatformType): ChatMessage[] {
    return this.chatStorageService.getMessagesByPlatform(platform);
  }

  async submitReply(messageId: string, text: string): Promise<void> {
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

    const sent = await this.providerCoordinator.sendReply(
      message.sourceChannelId,
      message.platform,
      message.sourceMessageId,
      text.trim()
    );
    if (!sent) {
      this.updateMessageAction(messageId, "reply", {
        status: "failed",
        reason: "Provider reply failed for this channel.",
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

    this.chatStorageService.addMessage(
      buildChannelRef(message.platform, message.sourceChannelId),
      replyMessage
    );
    this.refreshMessageCapabilities();
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

    this.chatStorageService.addMessage(buildChannelRef(platform, channelId), outgoing);
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
    const channel = channels.find(
      (ch) => ch.platform === message.platform && ch.channelId === message.sourceChannelId
    );
    const platform = channel?.platform ?? message.platform;

    const deleted = await this.providerCoordinator.deleteMessage(
      message.sourceChannelId,
      platform,
      message.sourceMessageId
    );
    if (!deleted) {
      this.updateMessageAction(messageId, "delete", {
        status: "failed",
        reason: "Provider delete failed for this channel.",
      });
      return;
    }

    this.chatStorageService.updateMessage(
      buildChannelRef(message.platform, message.sourceChannelId),
      messageId,
      {
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
      }
    );
  }

  refreshMessageCapabilities(): void {
    const channels = this.chatListService.getVisibleChannels();
    const allMessages = this.messages();

    for (const message of allMessages) {
      const channel = channels.find(
        (ch) => ch.platform === message.platform && ch.channelId === message.sourceChannelId
      );

      if (!channel) {
        continue;
      }

      const account = this.authorizationService.getAccountById(channel.accountId);
      const capabilities = getChannelAccountCapabilities(channel, account);

      this.chatStorageService.updateMessage(
        buildChannelRef(message.platform, message.sourceChannelId),
        message.id,
        {
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
        }
      );
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

  /**
   * Highlight a message (e.g., from search results)
   */
  highlightMessage(messageId: string | null): void {
    this.highlightedMessageIdSignal.set(messageId);
  }

  /**
   * Check if a message is currently highlighted
   */
  isMessageHighlighted(messageId: string): boolean {
    return this.highlightedMessageIdSignal() === messageId;
  }
}
