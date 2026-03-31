/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";
import { AuthorizationService } from "@services/features/authorization.service";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";
export interface KickUserInfo {
  id: string;
  username: string;
  bio: string;
  profile_pic_url: string;
}

export interface KickChannelInfo {
  chatroomId: number;
  broadcasterUserId: number;
}

interface RecentlySentMessage {
  username: string;
  content: string;
  timestamp: number;
}

@Injectable({
  providedIn: "root",
})
export class KickChatService extends BaseChatProviderService {
  readonly platform = "kick" as const;

  private readonly socketByChannel = new Map<string, WebSocket>();
  private readonly channelInfoByChannel = new Map<string, KickChannelInfo>(); // Stores both chatroomId and broadcasterUserId
  private readonly reconnectTimerByChannel = new Map<string, number>();
  private readonly historyNoticeLoggedChannels = new Set<string>();
  private readonly recentlySentMessages = new Map<string, RecentlySentMessage>(); // channel:messageKey -> info
  private readonly errorService = inject(ConnectionErrorService);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);

  override connect(channelId: string): void {
    const normalizedChannel = channelId.trim().toLowerCase();
    if (!normalizedChannel || this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    this.connectedChannels.add(normalizedChannel);
    void this.startLiveSocket(normalizedChannel);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = channelId.trim().toLowerCase();
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

  private async startLiveSocket(channelSlug: string): Promise<void> {
    try {
      const channelInfo = await this.fetchChannelInfo(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      this.channelInfoByChannel.set(channelSlug, channelInfo);
      await this.fetchKickRecentMessagesRest(channelSlug, channelInfo.chatroomId);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      this.openSocket(channelSlug, channelInfo.chatroomId);
    } catch (error) {
      this.errorService.reportNetworkError(
        channelSlug,
        "Failed to connect to Kick chat. Retrying...",
        true
      );
      this.scheduleReconnect(channelSlug);
    }
  }

  private openSocket(channelSlug: string, chatroomId: number): void {
    console.log(
      "[Kick WebSocket] Opening WebSocket connection for channel:",
      channelSlug,
      "chatroomId:",
      chatroomId
    );

    const socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0"
    );
    this.socketByChannel.set(channelSlug, socket);

    socket.addEventListener("open", () => {
      console.log(
        "[Kick WebSocket] Connection opened, subscribing to channel:",
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

    socket.addEventListener("error", () => {
      this.errorService.reportWebSocketError(channelSlug, "kick", true);
    });

    socket.addEventListener("close", (event) => {
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
      if (!channelInfo.chatroomId) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        throw new Error("missing kick chatroom id");
      }
      // Cache the channel info for future use
      this.channelInfoByChannel.set(channelSlug, channelInfo);
      return channelInfo;
    } catch (error) {
      const message = String(error ?? "");
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
        console.error("[Kick WebSocket] Failed to parse data payload");
        return;
      }
    } else if (parsed.data && typeof parsed.data === "object") {
      payload = parsed.data as Record<string, unknown>;
    }

    if (!payload) {
      console.error("[Kick WebSocket] No payload found");
      return;
    }

    console.log("[Kick WebSocket] Processing chat event payload:", payload);
    this.ingestKickChatEventPayload(channelSlug, payload);
  }

  private ingestKickChatEventPayload(channelSlug: string, payload: Record<string, unknown>): void {
    const mapped = this.kickChatEventMapper.mapChatEventPayload(payload);

    if (!mapped) {
      return;
    }

    // Check if this is a WebSocket echo of a recently sent message
    // Match by username + content + timestamp (within 5 seconds)
    const messageKey = `${mapped.author}:${mapped.content}`;
    const sentInfo = this.recentlySentMessages.get(`${channelSlug}:${messageKey}`);

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

        console.log(
          "[Kick Chat] Found outgoing message:",
          outgoingMessage
            ? {
                id: outgoingMessage.id,
                author: outgoingMessage.author,
                text: outgoingMessage.text,
                isOutgoing: outgoingMessage.isOutgoing,
              }
            : "NOT FOUND"
        );

        if (outgoingMessage) {
          console.log(
            "[Kick Chat] Updating message with Kick message ID:",
            `msg-${mapped.sourceMessageId}`
          );
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

    console.log("[Kick Chat] Adding message to chat storage:", {
      author: mapped.author,
      content: mapped.content,
      channel: channelSlug,
    });

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
    const timerId = window.setTimeout(() => {
      this.reconnectTimerByChannel.delete(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      void this.startLiveSocket(channelSlug);
    }, 2500);
    this.reconnectTimerByChannel.set(channelSlug, timerId);
  }

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    console.log("[Kick Send] sendMessage called:", { channelId, text, accountId });

    const account = this.authorizationService.getAccountById(accountId);
    console.log(
      "[Kick Send] Account:",
      account
        ? {
            id: account.id,
            username: account.username,
            userId: account.userId,
            authStatus: account.authStatus,
            hasAccessToken: !!account.accessToken,
          }
        : "No account"
    );

    if (account?.authStatus !== "authorized" || !account.accessToken) {
      console.error("[Kick Send] Cannot send - not authorized or no token");
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
    const normalizedChannel = channelId.trim().toLowerCase();
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    if (!account.accessToken) {
      return false;
    }

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
      console.error("[Kick Send] Failed:", error);

      // Handle rate limiting
      if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
        console.error("[Kick Send] Rate limit exceeded");
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

    console.log("[Kick Send] Creating outgoing message with author:", account.username);

    // Track this message for WebSocket echo detection
    // Key format: channel:username:content (use normalizedChannel for consistency)
    const messageKey = `${account.username}:${text}`;
    this.recentlySentMessages.set(`${normalizedChannel}:${messageKey}`, {
      username: account.username,
      content: text,
      timestamp: Date.now(),
    });

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
    const account = this.authorizationService.getAccountById(accountId);

    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      console.error("[Kick Delete] Cannot delete - not authorized or no token");
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
        console.warn("[Kick Delete] Cannot delete outgoing message without Kick message ID");
        return false;
      }

      const response = await invoke<boolean>("kickDeleteChatMessage", {
        messageId: kickMessageId,
        accessToken: account.accessToken,
      });

      console.log("[Kick Delete] Message deleted:", response);
      return response;
    } catch (error) {
      console.error("[Kick Delete] Failed:", error);
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
