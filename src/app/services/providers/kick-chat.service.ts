/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import { ReconnectionManager } from "@utils/reconnection-manager.util";

/* models */
import { RecentlySentMessage, KickUserInfo, KickChannelInfo } from "@models/platform-api.model";

/* helpers */
import { createMessageActionState, generateTimestamp } from "@helpers/chat.helper";
import { KickChatConnectionHandler } from "./kick-chat-connection.handler";
import { KickChatMessageHandler } from "./kick-chat-message.handler";

@Injectable({
  providedIn: "root",
})
export class KickChatService extends BaseChatProviderService {
  readonly platform = "kick" as const;

  private static readonly MAX_CHANNEL_INFO_CACHE = 50;
  private static readonly CHANNEL_INFO_TTL_MS = 30 * 60 * 1000;
  private static readonly MAX_RECENTLY_SENT_MESSAGES = 100;
  private static readonly RECENTLY_SENT_MESSAGE_TTL_MS = 10 * 1000;

  private readonly connectionHandler = new KickChatConnectionHandler();
  private readonly messageHandler = new KickChatMessageHandler();

  private readonly channelInfoByChannel = new Map<
    string,
    { info: KickChannelInfo; timestamp: number }
  >();
  private readonly historyNoticeLoggedChannels = new Set<string>();
  private readonly recentlySentMessages = new Map<string, RecentlySentMessage>();
  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LoggerService);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);

  override connectedChannels = this.connectionHandler.connectedChannels;

  constructor() {
    super();

    this.connectionHandler.onChatMessage = (channelSlug, payload) => {
      this.messageHandler.processChatPayload(channelSlug, payload);
    };

    this.messageHandler.onOutgoingMessage = (channelSlug, message) => {
      this.chatStorageService.addMessage(channelSlug, this.createMessage(channelSlug, message));
    };

    this.messageHandler.onMessageUpdate = (channelSlug, messageId, updates) => {
      const messages = this.chatStorageService.getMessagesByChannel(channelSlug);
      const outgoingMessage = messages.find(
        (m) =>
          m.text === updates.content &&
          m.isOutgoing === true &&
          m.sourceUserId === `kick-${updates.sourceUserId}`
      );
      if (outgoingMessage) {
        this.chatStorageService.updateMessage(channelSlug, outgoingMessage.id, {
          id: `msg-${updates.sourceMessageId}`,
          sourceMessageId: updates.sourceMessageId,
          isOutgoing: false,
        });
      }
    };
  }

  override connect(channelId: string): void {
    this.connectionHandler.connect(channelId);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    this.connectionHandler.disconnect(channelId);
    this.channelInfoByChannel.delete(normalizedChannel);
    this.historyNoticeLoggedChannels.delete(normalizedChannel);
    this.recentlySentMessages.delete(normalizedChannel);
  }

  private cleanupRecentlySentMessages(): void {
    this.messageHandler.cleanupRecentlySentMessages();
  }

  private cleanupChannelInfoCache(): void {
    const now = Date.now();
    for (const [key, value] of this.channelInfoByChannel) {
      if (now - value.timestamp > KickChatService.CHANNEL_INFO_TTL_MS) {
        this.channelInfoByChannel.delete(key);
      }
    }
    if (this.channelInfoByChannel.size > KickChatService.MAX_CHANNEL_INFO_CACHE) {
      const entriesToDelete =
        this.channelInfoByChannel.size - KickChatService.MAX_CHANNEL_INFO_CACHE;
      const keysToDelete = Array.from(this.channelInfoByChannel.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.channelInfoByChannel.delete(key);
      }
    }
  }

  protected override getActionStates() {
    return {
      reply: createMessageActionState(
        "reply",
        "disabled",
        "Reply is available only through linked account actions."
      ),
      delete: createMessageActionState("delete", "available", undefined),
    };
  }

  reconnectChannel(channelId: string): void {
    this.connectionHandler.reconnectChannel(channelId);
  }

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    this.logger.debug("KickChatService", "sendMessage called", { channelId, text, accountId });

    let account = this.authorizationService.getAccountByIdSync(accountId);
    this.logger.debug(
      "KickChatService",
      "Account lookup",
      account ? { id: account.id, username: account.username } : "No account"
    );

    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        this.logger.info("KickChatService", "Token expired, attempting refresh before send");
        void this.authorizationService.refreshAndReconnect(account.id, "kick").then((success) => {
          if (success) {
            const refreshed = this.authorizationService.getAccountByIdSync(account.id);
            if (refreshed && refreshed.authStatus === "authorized" && refreshed.accessToken) {
              this.logger.info("KickChatService", "Token refreshed, sending message");
              void this.sendMessageAsync(channelId, text, refreshed);
            } else {
              this.logger.warn("KickChatService", "Cannot send - refresh failed");
            }
          } else {
            this.logger.warn("KickChatService", "Token refresh failed");
          }
        });
        return true;
      }
      this.logger.warn("KickChatService", "Cannot send - not authorized or no token");
      return false;
    }

    void this.sendMessageAsync(channelId, text, account);
    return true;
  }

  private async sendMessageAsync(
    channelId: string,
    text: string,
    account: { username: string; userId: string; accessToken?: string }
  ): Promise<boolean> {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    if (!account.accessToken) {
      return false;
    }

    const messageKey = `${account.username}:${trimmed}`;
    this.recentlySentMessages.set(`${normalizedChannel}:${messageKey}`, {
      username: account.username,
      content: trimmed,
      timestamp: Date.now(),
    });
    this.cleanupRecentlySentMessages();

    try {
      const channelInfo = await this.fetchChannelInfo(normalizedChannel);

      const response = await invoke<boolean>("kickSendChatMessage", {
        chatroomId: Number(channelInfo.chatroomId),
        content: trimmed,
        accessToken: account.accessToken,
        broadcasterUserId: Number(channelInfo.broadcasterUserId),
        replyToMessageId: null,
      });

      if (response) {
        this.addOutgoingMessageToChat(normalizedChannel, trimmed, account);
      }

      return response;
    } catch (error) {
      const errorMessage = String(error ?? "");
      this.logger.error("KickChatService", "Send message failed", error);

      if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
        this.logger.warn("KickChatService", "Rate limit exceeded");
      }

      return false;
    }
  }

  private addOutgoingMessageToChat(
    normalizedChannel: string,
    text: string,
    account: { username: string; userId: string; accessToken?: string }
  ): void {
    const timestamp = generateTimestamp();
    const messageId = `kick-outgoing-${Date.now()}`;

    this.logger.debug("KickChatService", "Creating outgoing message with author", account.username);

    this.chatStorageService.addMessage(
      normalizedChannel,
      this.createMessage(normalizedChannel, {
        id: messageId,
        sourceMessageId: messageId,
        sourceUserId: `kick-${account.userId}`,
        author: account.username,
        text: text,
        timestamp: timestamp,
        badges: [],
        isOutgoing: true,
        authorAvatarUrl: undefined,
        rawPayload: {
          providerEvent: "chat.message.sent",
          providerChannelId: normalizedChannel,
          providerUserId: account.userId,
          preview: text.slice(0, 120),
        },
      })
    );
  }

  async fetchUserInfo(username: string): Promise<KickUserInfo | null> {
    return this.messageHandler.fetchUserInfo(username);
  }

  async deleteMessage(messageId: string, accountId?: string): Promise<boolean> {
    const account = await this.authorizationService.getAccountById(accountId);

    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn("KickChatService", "Cannot delete - not authorized or no token");
      return false;
    }

    try {
      let kickMessageId = messageId;
      if (messageId.startsWith("msg-")) {
        kickMessageId = messageId.substring(4);
      } else if (messageId.startsWith("kick-outgoing-")) {
        this.logger.warn(
          "KickChatService",
          "Cannot delete outgoing message without Kick message ID"
        );
        return false;
      }

      const response = await invoke<boolean>("kickDeleteChatMessage", {
        messageId: kickMessageId,
        accessToken: account.accessToken,
      });

      this.logger.info("KickChatService", "Message deleted", response);
      return response;
    } catch (error) {
      this.logger.error("KickChatService", "Delete message failed", error);
      return false;
    }
  }

  private async fetchChannelInfo(channelSlug: string): Promise<KickChannelInfo> {
    const cached = this.channelInfoByChannel.get(channelSlug);
    if (cached && Date.now() - cached.timestamp <= KickChatService.CHANNEL_INFO_TTL_MS) {
      return cached.info;
    }

    this.cleanupChannelInfoCache();

    const account = this.authorizationService
      .accounts()
      .find((acc) => acc.platform === "kick" && acc.authStatus === "authorized");

    try {
      const channelInfo = await invoke<KickChannelInfo>("kickFetchChatroomId", {
        channelSlug,
        accessToken: account?.accessToken || null,
      });
      this.logger.info("KickChatService", "Fetched channel info for", channelSlug, channelInfo);
      if (!channelInfo.chatroomId) {
        this.logger.error("KickChatService", "Missing chatroom ID for", channelSlug);
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        throw new Error("missing kick chatroom id");
      }
      this.channelInfoByChannel.set(channelSlug, { info: channelInfo, timestamp: Date.now() });
      return channelInfo;
    } catch (error) {
      const message = String(error ?? "");
      this.logger.error(
        "KickChatService",
        "fetchChannelInfo failed for",
        channelSlug,
        "error:",
        error
      );
      if (message.includes("404") || message.includes("not found")) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
      } else if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("authentication")
      ) {
        this.errorService.reportNetworkError(
          channelSlug,
          "Kick API requires authentication. Some features may be limited.",
          false
        );
        throw new Error(`Kick API unavailable: ${message}`);
      } else if (message.includes("500")) {
        if (cached) {
          this.logger.warn("KickChatService", "Using cached channel info for", channelSlug);
          return cached.info;
        }
        this.errorService.reportNetworkError(channelSlug, "Kick API temporarily unavailable");
      } else {
        this.errorService.reportNetworkError(channelSlug, "Failed to fetch channel info");
      }
      throw error;
    }
  }
}
