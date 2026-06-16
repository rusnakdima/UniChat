/* sys lib */
import { Injectable, computed, effect, inject, untracked } from "@angular/core";

/* models */
import {
  ChatChannel,
  ChatMessage,
  MessageAction,
  MessageActionKind,
  PlatformType,
} from "@models/chat.model";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { PlatformResolverService } from "@services/core/platform-resolver.service";
import { ChatListService } from "@services/data/chat-list.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { MessageCapabilitiesService } from "@services/data/message-capabilities.service";
import { OptimisticMessageService } from "@services/data/optimistic-message.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";
import { MessageHighlightService } from "@services/ui/message-highlight.service";

/* helpers */
import { buildSplitFeed, createMessageActionState } from "@shared/utils/chat.helper";
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
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly platformResolver = inject(PlatformResolverService);
  private readonly chatListService = inject(ChatListService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly chatStorageService = inject(UnifiedStorageService);
  private readonly providerCoordinator = inject(ChatProviderCoordinatorService);
  private readonly optimisticMessageService = inject(OptimisticMessageService);
  private readonly messageCapabilitiesService = inject(MessageCapabilitiesService);
  private readonly messageHighlightService = inject(MessageHighlightService);

  readonly highlightedMessageId = this.messageHighlightService.highlightedMessageId;

  readonly messages = computed(() => this.chatStorageService.allMessages());

  readonly splitFeed = computed(() => buildSplitFeed(this.messages()));

  constructor() {
    effect(() => {
      this.chatListService.channels();
      this.authorizationService.accounts();
      untracked(() => this.messageCapabilitiesService.refreshMessageCapabilities(this.messages));
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

    this.logger.warn("Reply functionality is currently unavailable for this platform.", {
      source: "ChatStateService",
    });

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

    if (platform === "twitch") {
      if (optimistic) {
        setTimeout(
          () => this.optimisticMessageService.createOptimisticMessage(platform, channelId, trimmed),
          0
        );
      }

      void this.providerCoordinator
        .sendMessage(channelId, platform, trimmed)
        .then((sentToProvider) => {
          if (!sentToProvider) {
            if (optimistic) {
              this.optimisticMessageService.markOptimisticMessageFailed(
                platform,
                channelId,
                trimmed,
                "Send failed"
              );
            }
          }
        })
        .catch((error) => {
          if (optimistic) {
            this.optimisticMessageService.markOptimisticMessageFailed(
              platform,
              channelId,
              trimmed,
              error
            );
          }
        });
    } else {
      if (optimistic) {
        setTimeout(
          () => this.optimisticMessageService.createOptimisticMessage(platform, channelId, trimmed),
          0
        );
      }

      void this.providerCoordinator
        .sendMessage(channelId, platform, trimmed)
        .then((sentToProvider) => {
          if (optimistic) {
            this.optimisticMessageService.updateOptimisticMessageStatus(
              platform,
              channelId,
              trimmed,
              sentToProvider
            );
          }
        })
        .catch((error) => {
          if (optimistic) {
            this.optimisticMessageService.updateOptimisticMessageStatus(
              platform,
              channelId,
              trimmed,
              false,
              error
            );
          }
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

  highlightMessage(messageId: string | null): void {
    this.messageHighlightService.highlightMessage(messageId);
  }

  isMessageHighlighted(messageId: string): boolean {
    return this.messageHighlightService.isMessageHighlighted(messageId);
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
