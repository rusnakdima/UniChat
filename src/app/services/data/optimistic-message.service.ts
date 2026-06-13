import { Injectable, inject } from "@angular/core";

import { ChatMessage, PlatformType } from "@models/chat.model";

import { LoggerService } from "@services/core/logger.service";
import { ChatStorageService } from "@services/data/chat-storage.service";

import { createMessageActionState, generateTimestamp } from "@helpers/chat.helper";
import { buildChannelRef } from "@utils/channel-ref.util";

function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable({
  providedIn: "root",
})
export class OptimisticMessageService {
  private readonly logger = inject(LoggerService);
  private readonly chatStorageService = inject(ChatStorageService);

  createOptimisticMessage(platform: PlatformType, channelId: string, text: string): void {
    const id = `out-${platform}-${channelId}-${generateUuidV4()}`;
    const outgoing: ChatMessage = {
      id,
      platform,
      sourceMessageId: id,
      sourceChannelId: channelId,
      sourceUserId: "local-user",
      author: "You",
      text: text,
      timestamp: generateTimestamp(),
      badges: ["operator"],
      isSupporter: false,
      isOutgoing: true,
      isDeleted: false,
      canRenderInOverlay: false,
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
  }

  markOptimisticMessageFailed(
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

  updateOptimisticMessageStatus(
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
}
