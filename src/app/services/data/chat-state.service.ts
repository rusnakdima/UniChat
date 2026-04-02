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
import { LoggerService } from "@services/core/logger.service";
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
  private readonly logger = inject(LoggerService);
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

    // Reply is currently disabled for all platforms (tmi.js limitation for Twitch)
    // This method is kept for future implementation
    this.logger.warn(
      "ChatStateService",
      "Reply functionality is currently unavailable for this platform."
    );

    this.updateMessageAction(messageId, "reply", {
      status: "disabled",
      reason: "Reply functionality is currently unavailable.",
    });
  }

  async sendOutgoingChatMessage(
    channelId: string,
    platform: PlatformType,
    text: string,
    optimistic: boolean = true
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

    // Fire-and-forget: send to provider without blocking
    // For Twitch, we skip creating a synthetic message since Twitch echoes back
    if (platform === "twitch") {
      // Create optimistic message immediately if requested
      if (optimistic) {
        this.createOptimisticMessage(platform, channelId, trimmed);
      }

      void this.providerCoordinator
        .sendMessage(channelId, platform, trimmed)
        .then((sentToProvider) => {
          if (!sentToProvider) {
            // Mark as failed if send failed (only if we created optimistic message)
            if (optimistic) {
              // Find and update the optimistic message
              this.markOptimisticMessageFailed(platform, channelId, trimmed, "Send failed");
            }
          }
          // If sentToProvider is true, Twitch will echo the message back
          // The echo will be handled by the message listener
        })
        .catch((error) => {
          if (optimistic) {
            this.markOptimisticMessageFailed(platform, channelId, trimmed, error);
          }
        });
    } else {
      // For Kick and YouTube
      if (optimistic) {
        // Create optimistic message immediately
        this.createOptimisticMessage(platform, channelId, trimmed);
      }

      // Fire-and-forget send to provider
      void this.providerCoordinator
        .sendMessage(channelId, platform, trimmed)
        .then((sentToProvider) => {
          if (optimistic) {
            // Update the optimistic message status
            this.updateOptimisticMessageStatus(platform, channelId, trimmed, sentToProvider);
          }
          // If not optimistic, the echo will be handled by the message listener
        })
        .catch((error) => {
          if (optimistic) {
            this.updateOptimisticMessageStatus(platform, channelId, trimmed, false, error);
          }
        });
    }
  }

  /**
   * Create an optimistic outgoing message for instant UI feedback
   */
  private createOptimisticMessage(platform: PlatformType, channelId: string, text: string): void {
    const id = `out-${platform}-${channelId}-${Date.now()}`;
    const outgoing: ChatMessage = {
      id,
      platform,
      sourceMessageId: id,
      sourceChannelId: channelId,
      sourceUserId: "local-user",
      author: "You",
      text: text,
      timestamp: new Date().toISOString(),
      badges: ["operator"],
      isSupporter: false,
      isOutgoing: true,
      isDeleted: false,
      canRenderInOverlay: false, // Don't show optimistic messages in overlay
      actions: {
        reply: createMessageActionState("reply", "pending"),
        delete: createMessageActionState("delete", "pending"),
      },
      rawPayload: {
        providerEvent: "outgoing_sending",
        providerChannelId: channelId,
        providerUserId: "local-user",
        preview: text.slice(0, 120),
      },
    };

    this.chatStorageService.addMessage(buildChannelRef(platform, channelId), outgoing);
    this.refreshMessageCapabilities();
  }

  /**
   * Mark optimistic message as failed
   */
  private markOptimisticMessageFailed(
    platform: PlatformType,
    channelId: string,
    text: string,
    error: unknown
  ): void {
    const channelRef = buildChannelRef(platform, channelId);
    const messages = this.chatStorageService.getMessagesByChannel(channelRef);

    const optimisticMessage = messages.find((msg) => {
      if (!msg.isOutgoing || msg.isDeleted) return false;
      if (msg.author !== "You") return false;
      if (msg.text !== text) return false;
      const messageTime = new Date(msg.timestamp).getTime();
      return Date.now() - messageTime < 5000;
    });

    if (optimisticMessage) {
      this.chatStorageService.updateMessage(channelRef, optimisticMessage.id, {
        actions: {
          reply: createMessageActionState("reply", "disabled", "Cannot reply - message not sent"),
          delete: createMessageActionState("delete", "failed", `Send failed: ${error}`),
        },
        rawPayload: {
          ...optimisticMessage.rawPayload,
          providerEvent: "outgoing_send_failed",
        },
      });
    }
  }

  /**
   * Update optimistic message status after send completes
   */
  private updateOptimisticMessageStatus(
    platform: PlatformType,
    channelId: string,
    text: string,
    sentToProvider: boolean,
    error?: unknown
  ): void {
    const channelRef = buildChannelRef(platform, channelId);
    const messages = this.chatStorageService.getMessagesByChannel(channelRef);

    const optimisticMessage = messages.find((msg) => {
      if (!msg.isOutgoing || msg.isDeleted) return false;
      if (msg.author !== "You") return false;
      if (msg.text !== text) return false;
      const messageTime = new Date(msg.timestamp).getTime();
      return Date.now() - messageTime < 5000;
    });

    if (optimisticMessage) {
      this.chatStorageService.updateMessage(channelRef, optimisticMessage.id, {
        actions: {
          reply: createMessageActionState(
            "reply",
            sentToProvider ? "available" : "disabled",
            sentToProvider ? undefined : "Cannot reply - message not sent"
          ),
          delete: createMessageActionState(
            "delete",
            sentToProvider ? "available" : "failed",
            sentToProvider ? undefined : `Send failed: ${error}`
          ),
        },
        rawPayload: {
          ...optimisticMessage.rawPayload,
          providerEvent: sentToProvider ? "outgoing_sent" : "outgoing_send_failed",
        },
      });
    }
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

      // Note: Uses sync version - accounts are loaded when channels are connected
      const account = this.authorizationService.getAccountByIdSync(channel.accountId);
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
