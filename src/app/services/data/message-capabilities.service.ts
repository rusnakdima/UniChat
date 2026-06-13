import { Injectable, inject } from "@angular/core";

import { ChatMessage, ChannelAccountCapabilities } from "@models/chat.model";

import { LoggerService } from "@services/core/logger.service";
import { PlatformResolverService } from "@services/core/platform-resolver.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";

import { createMessageActionState } from "@helpers/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";

@Injectable({
  providedIn: "root",
})
export class MessageCapabilitiesService {
  private readonly logger = inject(LoggerService);
  private readonly platformResolver = inject(PlatformResolverService);
  private readonly chatListService = inject(ChatListService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly chatStorageService = inject(ChatStorageService);

  refreshMessageCapabilities(messages: () => ChatMessage[]): void {
    const channels = this.chatListService.getVisibleChannels();
    const allMessages = messages();

    const updatesByChannel = new Map<
      string,
      Array<{ messageId: string; changes: Partial<ChatMessage> }>
    >();

    for (const message of allMessages) {
      const channel = channels.find(
        (ch) => ch.platform === message.platform && ch.channelId === message.sourceChannelId
      );

      if (!channel) {
        continue;
      }

      const account = this.authorizationService.getAccountByIdSync(channel.accountId);
      const isAuthorized = account?.authStatus === "authorized";
      const base = isAuthorized
        ? this.platformResolver.getCapabilities(channel.platform)
        : { canListen: true, canReply: false, canDelete: false };

      const moderation = channel.accountCapabilities;

      const capabilities: ChannelAccountCapabilities = {
        ...base,
        canDelete: base.canDelete && moderation?.verified === true && moderation.canDelete,
        canModerate: moderation?.verified === true && moderation.canModerate,
        moderationRole: moderation?.moderationRole ?? "viewer",
        verified: moderation?.verified ?? false,
      };

      const messageUpdate = {
        messageId: message.id,
        changes: {
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
        },
      };

      const channelRef = buildChannelRef(message.platform, message.sourceChannelId);
      const existing = updatesByChannel.get(channelRef) ?? [];
      existing.push(messageUpdate);
      updatesByChannel.set(channelRef, existing);
    }

    for (const [channelRef, updates] of updatesByChannel) {
      this.chatStorageService.batchUpdateMessagesForChannel(channelRef, updates);
    }
  }
}
