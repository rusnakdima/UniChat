/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";
import { normalizeChannelId } from "@utils/channel-normalization.util";

/* models */
import { RecentlySentMessage, KickUserInfo, KickChannelInfo } from "@models/platform-api.model";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";

@Injectable({
  providedIn: "root",
})
export class KickChatService extends BaseChatProviderService {
  readonly platform = "kick" as const;

  private readonly socketByChannel = new Map<string, WebSocket>();
  private readonly channelInfoByChannel = new Map<string, KickChannelInfo>();
  private readonly reconnectTimerByChannel = new Map<string, number>();
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly historyNoticeLoggedChannels = new Set<string>();
  private readonly recentlySentMessages = new Map<string, RecentlySentMessage>();
  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LoggerService);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);

  override connect(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    if (!normalizedChannel || this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    this.connectedChannels.add(normalizedChannel);
    void this.startLiveSocket(normalizedChannel);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    this.connectedChannels.delete(normalizedChannel);
    const socket = this.socketByChannel.get(normalizedChannel);
    if (socket) {
      socket.close();
      this.socketByChannel.delete(normalizedChannel);
    }
    this.channelInfoByChannel.delete(normalizedChannel);
    const reconnectTimer = this.reconnectTimerByChannel.get(normalizedChannel);
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      this.reconnectTimerByChannel.delete(normalizedChannel);
    }
    this.historyNoticeLoggedChannels.delete(normalizedChannel);
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

  private openSocket(channelSlug: string, chatroomId: number): void {
    this.logger.debug(
      "KickChatService",
      "Opening WebSocket connection for channel",
      channelSlug,
      "chatroomId:",
      chatroomId
    );

    const socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0"
    );
    this.socketByChannel.set(channelSlug, socket);

    socket.addEventListener("open", () => {
      this.logger.debug(
        "KickChatService",
        "Connection opened, subscribing to channel",
        `chatrooms.${chatroomId}.v2`
      );
      socket.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: {
            channel: `chatrooms.${chatroomId}.v2`,
          },
        })
      );
    });

    socket.addEventListener("message", (event) => {
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      const data = String(event.data ?? "");
      this.handleSocketMessage(channelSlug, data);
    });

    socket.addEventListener("error", (event) => {
      this.logger.error("KickChatService", "WebSocket error for", channelSlug, event);
      this.errorService.reportWebSocketError(channelSlug, "kick", true);
    });

    socket.addEventListener("close", (event) => {
      this.logger.warn(
        "KickChatService",
        "WebSocket closed for",
        channelSlug,
        "code:",
        event.code,
        "reason:",
        event.reason
      );
      this.socketByChannel.delete(channelSlug);
      if (this.connectedChannels.has(channelSlug)) {
        this.scheduleReconnect(channelSlug);
      }
    });
  }

  private async fetchChannelInfo(channelSlug: string): Promise<KickChannelInfo> {
    // Check cache first
    const cached = this.channelInfoByChannel.get(channelSlug);
    if (cached) {
      return cached;
    }

    // Get access token for authenticated request
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
      // Cache the channel info for future use
      this.channelInfoByChannel.set(channelSlug, channelInfo);
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
        // Kick API sometimes returns 500 - use cached channel info if available
        if (cached) {
          this.logger.warn("KickChatService", "Using cached channel info for", channelSlug);
          return cached;
        }
        this.errorService.reportNetworkError(channelSlug, "Kick API temporarily unavailable");
      } else {
        this.errorService.reportNetworkError(channelSlug, "Failed to fetch channel info");
      }
      throw error;
    }
  }

  private handleSocketMessage(channelSlug: string, rawData: string): void {
    let parsed: { event?: string; data?: unknown } | undefined;
    try {
      parsed = JSON.parse(rawData) as { event?: string; data?: unknown };
    } catch {
      return;
    }

    if (parsed?.event !== "App\\Events\\ChatMessageEvent") {
      return;
    }

    let payload: Record<string, unknown> | undefined;
    if (typeof parsed.data === "string") {
      try {
        payload = JSON.parse(parsed.data) as Record<string, unknown>;
      } catch {
        this.logger.error("KickChatService", "Failed to parse data payload");
        return;
      }
    } else if (parsed.data && typeof parsed.data === "object") {
      payload = parsed.data as Record<string, unknown>;
    }

    if (!payload) {
      this.logger.error("KickChatService", "No payload found");
      return;
    }

    this.logger.debug("KickChatService", "Processing chat event payload");
    this.ingestKickChatEventPayload(channelSlug, payload);
    this.logger.debug("KickChatService", "Message processing complete");
  }

  private ingestKickChatEventPayload(channelSlug: string, payload: Record<string, unknown>): void {
    const mapped = this.kickChatEventMapper.mapChatEventPayload(payload);

    if (!mapped) {
      return;
    }

    this.logger.debug(
      "KickChatService",
      "Processing message",
      mapped.sourceMessageId,
      mapped.content
    );

    // Check if this is a WebSocket echo of a recently sent message
    // Match by username + content + timestamp (within 5 seconds)
    const messageKey = `${mapped.author}:${mapped.content}`;
    const sentInfo = this.recentlySentMessages.get(`${channelSlug}:${messageKey}`);

    this.logger.debug("KickChatService", "Sent info check", sentInfo ? "FOUND" : "NOT FOUND");

    if (sentInfo) {
      const now = Date.now();
      const sentTime = sentInfo.timestamp;
      if (now - sentTime < 5000) {
        // This is an echo of a recently sent message
        // Update the existing outgoing message with the real Kick message ID
        const messages = this.chatStorageService.getMessagesByChannel(channelSlug);
        const outgoingMessage = messages.find(
          (m) =>
            m.text === mapped.content &&
            m.isOutgoing === true &&
            m.sourceUserId === `kick-${mapped.sourceUserId}`
        );

        this.logger.debug(
          "KickChatService",
          "Echo detected - updating existing message, skipping add"
        );

        if (outgoingMessage) {
          // Update the message with the real Kick message ID
          this.chatStorageService.updateMessage(channelSlug, outgoingMessage.id, {
            id: `msg-${mapped.sourceMessageId}`,
            sourceMessageId: mapped.sourceMessageId,
            isOutgoing: false, // Remove outgoing flag since it's now confirmed
          });
        }

        // Clean up the tracking entry
        this.recentlySentMessages.delete(`${channelSlug}:${messageKey}`);
        return;
      }
      // Clean up old entry
      this.recentlySentMessages.delete(`${channelSlug}:${messageKey}`);
    }

    this.logger.debug("KickChatService", "Adding new message to storage", mapped.sourceMessageId);

    this.chatStorageService.addMessage(
      channelSlug,
      this.createMessage(channelSlug, {
        id: `msg-${mapped.sourceMessageId}`,
        sourceMessageId: mapped.sourceMessageId,
        sourceUserId: mapped.sourceUserId,
        author: mapped.author,
        text: mapped.content,
        badges: mapped.badges,
        timestamp: mapped.timestamp,
        rawPayload: {
          providerEvent: "chat.message",
          providerChannelId: channelSlug,
          providerUserId: mapped.sourceUserId,
          preview: mapped.previewBase.slice(0, 120),
          emotes: mapped.emotes.length ? mapped.emotes : undefined,
        },
        authorAvatarUrl: mapped.authorAvatarUrl,
      })
    );
  }

  /**
   * Reconnect a channel with fresh token
   * Called after token refresh to re-establish WebSocket connection with new credentials
   */
  reconnectChannel(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    if (!this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    this.logger.info(
      "KickChatService",
      "Reconnecting channel",
      normalizedChannel,
      "with new token"
    );
    // Clear cached channel info so it gets re-fetched with new token
    this.channelInfoByChannel.delete(normalizedChannel);
    // Reset reconnect attempts for clean reconnect
    this.reconnectAttempts.delete(normalizedChannel);
    // Disconnect and reconnect
    this.disconnect(normalizedChannel);
    this.connect(normalizedChannel);
  }

  private async fetchKickRecentMessagesRest(
    channelSlug: string,
    chatroomId: number
  ): Promise<void> {
    try {
      const payloadRaw = await invoke<string>("kickFetchRecentMessages", {
        channelSlug,
        chatroomId,
      });
      const payload = JSON.parse(payloadRaw);
      const messages = this.extractHistoryMessages(payload);
      for (const message of messages.reverse()) {
        this.ingestKickChatEventPayload(channelSlug, message);
      }
    } catch {
      // History is optional; live websocket still continues.
    }
  }

  private scheduleReconnect(channelSlug: string): void {
    if (!this.connectedChannels.has(channelSlug) || this.reconnectTimerByChannel.has(channelSlug)) {
      return;
    }

    const attempts = this.reconnectAttempts.get(channelSlug) ?? 0;
    const baseDelay = 1000;
    const maxDelay = 30000;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempts));

    // Add jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    const finalDelay = Math.max(500, delay + jitter); // Minimum 500ms

    this.logger.debug(
      "KickChatService",
      "Scheduling reconnect for",
      channelSlug,
      "attempt",
      attempts + 1,
      "delay",
      Math.round(finalDelay),
      "ms"
    );

    const timerId = window.setTimeout(() => {
      this.reconnectTimerByChannel.delete(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      void this.startLiveSocket(channelSlug);
    }, finalDelay);

    this.reconnectTimerByChannel.set(channelSlug, timerId);
  }

  private async startLiveSocket(channelSlug: string): Promise<void> {
    // Reset reconnect attempts on successful connection
    this.reconnectAttempts.set(channelSlug, 0);

    try {
      const channelInfo = await this.fetchChannelInfo(channelSlug);
      if (!channelInfo) {
        this.logger.error("KickChatService", "No channel info returned for", channelSlug);
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        return;
      }
      this.logger.info(
        "KickChatService",
        "Got channel info for",
        channelSlug,
        "chatroomId:",
        channelInfo.chatroomId
      );
      this.channelInfoByChannel.set(channelSlug, channelInfo);
      await this.fetchKickRecentMessagesRest(channelSlug, channelInfo.chatroomId);
      if (!this.connectedChannels.has(channelSlug)) {
        this.logger.warn("KickChatService", "Channel", channelSlug, "disconnected during setup");
        return;
      }
      this.logger.info("KickChatService", "Opening WebSocket for", channelSlug);
      this.openSocket(channelSlug, channelInfo.chatroomId);
    } catch (error) {
      // Increment reconnect attempts for exponential backoff
      const attempts = this.reconnectAttempts.get(channelSlug) ?? 0;
      this.reconnectAttempts.set(channelSlug, attempts + 1);

      this.logger.error(
        "KickChatService",
        "Failed to connect to",
        channelSlug,
        "attempt:",
        attempts + 1,
        "error:",
        error
      );
      this.errorService.reportNetworkError(
        channelSlug,
        "Failed to connect to Kick chat. Retrying...",
        true
      );
      this.scheduleReconnect(channelSlug);
    }
  }

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    this.logger.debug("KickChatService", "sendMessage called", { channelId, text, accountId });

    // Note: Uses sync version - assumes accounts are loaded by the time user sends messages
    let account = this.authorizationService.getAccountByIdSync(accountId);
    this.logger.debug(
      "KickChatService",
      "Account lookup",
      account ? { id: account.id, username: account.username } : "No account"
    );

    // Check if token needs refresh
    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        this.logger.info("KickChatService", "Token expired, attempting refresh before send");
        // Refresh token synchronously to ensure it completes before send
        void this.authorizationService.refreshAndReconnect(account.id, "kick").then((success) => {
          if (success) {
            // Reload account after refresh
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
        return true; // Return true, message will be sent after refresh
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

    // Track this message BEFORE API call - WebSocket echo might arrive before API returns
    const messageKey = `${account.username}:${trimmed}`;
    this.recentlySentMessages.set(`${normalizedChannel}:${messageKey}`, {
      username: account.username,
      content: trimmed,
      timestamp: Date.now(),
    });

    try {
      // Fetch channel info (includes chatroom ID and broadcaster user ID)
      const channelInfo = await this.fetchChannelInfo(normalizedChannel);

      // Use the official Kick API endpoint via Tauri command
      // broadcaster_user_id is the channel owner's user ID
      const response = await invoke<boolean>("kickSendChatMessage", {
        chatroomId: Number(channelInfo.chatroomId),
        content: trimmed,
        accessToken: account.accessToken,
        broadcasterUserId: Number(channelInfo.broadcasterUserId),
        replyToMessageId: null,
      });

      // Add the message to the chat immediately (don't wait for WebSocket echo)
      if (response) {
        this.addOutgoingMessageToChat(normalizedChannel, trimmed, account);
      }

      return response;
    } catch (error) {
      const errorMessage = String(error ?? "");
      this.logger.error("KickChatService", "Send message failed", error);

      // Handle rate limiting
      if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
        this.logger.warn("KickChatService", "Rate limit exceeded");
      }

      return false;
    }
  }

  /**
   * Add an outgoing message to the chat UI immediately
   */
  private addOutgoingMessageToChat(
    normalizedChannel: string,
    text: string,
    account: { username: string; userId: string; accessToken?: string }
  ): void {
    const timestamp = new Date().toISOString();
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
        authorAvatarUrl: undefined, // Will be loaded lazily
        rawPayload: {
          providerEvent: "chat.message.sent",
          providerChannelId: normalizedChannel,
          providerUserId: account.userId,
          preview: text.slice(0, 120),
        },
      })
    );
  }

  /**
   * Fetch Kick user info (no authentication required)
   * @param username - Kick username
   * @returns User info with profile picture, bio, etc.
   */
  async fetchUserInfo(username: string): Promise<KickUserInfo | null> {
    try {
      // Try browser fetch first
      const response = await fetch(`https://kick.com/api/v1/channels/${username}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://kick.com/",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          user?: { id?: number; username?: string; bio?: string; profile_pic?: string };
        };
        if (data.user) {
          return {
            id: String(data.user.id ?? ""),
            username: data.user.username ?? username,
            bio: data.user.bio ?? "",
            profile_pic_url: data.user.profile_pic ?? "",
          };
        }
      }

      // Fallback to Tauri command
      const userInfo = await invoke<KickUserInfo>("kickFetchUserInfo", { username });
      return userInfo;
    } catch {
      return null;
    }
  }

  /**
   * Delete a chat message (requires moderation:chat_message:manage scope)
   * @param messageId - The message ID to delete
   * @param accountId - The account ID to use for authentication
   * @returns true if deleted successfully
   */
  async deleteMessage(messageId: string, accountId?: string): Promise<boolean> {
    const account = await this.authorizationService.getAccountById(accountId);

    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      this.logger.warn("KickChatService", "Cannot delete - not authorized or no token");
      return false;
    }

    try {
      // Extract the actual Kick message ID from our internal ID format
      // Our format: "msg-{message_id}" or "kick-outgoing-{timestamp}"
      let kickMessageId = messageId;
      if (messageId.startsWith("msg-")) {
        kickMessageId = messageId.substring(4);
      } else if (messageId.startsWith("kick-outgoing-")) {
        // Outgoing messages don't have a real Kick message ID yet
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

  private extractHistoryMessages(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === "object"
      );
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    const rows =
      (payload as Record<string, unknown>)["data"] ??
      (payload as Record<string, unknown>)["messages"];
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object"
    );
  }
}
