/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import tmi from "tmi.js";

/* models */
import { ChatBadgeIcon, ChatMessage, ChatMessageEmote } from "@models/chat.model";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";
import { TwitchEmotesService } from "@services/providers/twitch-emotes.service";
import { ReconnectionService } from "@services/core/reconnection.service";
import { TwitchViewerCardService } from "@services/providers/twitch-viewer-card.service";
import { buildChannelRef } from "@utils/channel-ref.util";

import {
  extractIrcTagMapFromLine,
  parseRecentMessagesPrivmsg,
} from "@services/providers/twitch-robotty-privmsg.parser";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";

export type { TwitchUserInfo } from "@services/providers/twitch-viewer-card.service";

@Injectable({
  providedIn: "root",
})
export class TwitchChatService extends BaseChatProviderService {
  readonly platform = "twitch" as const;

  /**
   * Third-party mirror of Twitch chat (same source many clients use — NOT Twitch's private web API).
   * See https://recent-messages.robotty.de/ — keeps up to ~800 messages per channel and up to ~24h.
   */
  private static readonly ROBOTTY_RECENT_MESSAGES =
    "https://recent-messages.robotty.de/api/v2/recent-messages";

  private readonly clientsByChannel = new Map<string, tmi.Client>();
  private readonly messageListeners = new Map<
    string,
    (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => void
  >();
  private readonly connectedListeners = new Map<string, () => void>();
  private readonly disconnectedListeners = new Map<string, () => void>();
  private readonly reconnectListeners = new Map<string, () => void>();
  private readonly roomstateListeners = new Map<
    string,
    (channel: string, state: tmi.RoomState) => void
  >();
  private readonly failureListeners = new Map<string, () => void>();
  private readonly noticeListeners = new Map<string, (reason: string) => void>();
  private readonly statusListeners = new Set<
    (channelId: string, status: TwitchConnectionStatus) => void
  >();
  private readonly iconsCatalog = inject(IconsCatalogService);
  private readonly twitchEmotes = inject(TwitchEmotesService);
  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LoggerService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly reconnectionService = inject(ReconnectionService);
  private readonly viewerCard = inject(TwitchViewerCardService);

  override connect(channelId: string): void {
    void this.connectAsync(channelId);
  }

  private async connectAsync(channelId: string): Promise<void> {
    void this.iconsCatalog.ensureGlobalLoaded();
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    if (!normalizedChannel || this.clientsByChannel.has(normalizedChannel)) {
      return;
    }

    // Wait for accounts to be loaded before connecting
    await this.authorizationService.waitForAccounts(3000);

    this.emitStatus(normalizedChannel, "connecting");

    const account = this.resolveAccountForChannel(normalizedChannel);

    const client = new tmi.Client({
      options: {
        skipUpdatingEmotesets: true,
      },
      channels: [normalizedChannel],
      connection: { reconnect: true, secure: true },
      identity:
        account?.authStatus === "authorized" && account.accessToken
          ? {
              username: account.username.toLowerCase(),
              password: `oauth:${account.accessToken}`,
            }
          : undefined,
    });

    const messageListener = (
      _channel: string,
      tags: tmi.ChatUserstate,
      message: string,
      self: boolean
    ) => {
      const messageModel = this.buildMessageFromTmiPrivmsg(normalizedChannel, tags, message, self);
      if (messageModel) {
        messageModel.receivedAt = Date.now();

        this.reconnectionService.trackMessage(normalizedChannel, messageModel, "twitch");

        // If this is our own message (echo from Twitch), try to find and update the optimistic message
        if (self) {
          this.handleOwnMessageEcho(normalizedChannel, message, messageModel.id);
        }

        this.chatStorageService.addMessage(normalizedChannel, messageModel);
      }
    };
    client.on("message", messageListener);
    this.messageListeners.set(normalizedChannel, messageListener);

    const connectedListener = () => {
      this.emitStatus(normalizedChannel, "connected");
      this.errorService.clearError(normalizedChannel);
      // Clear gap indicator on successful reconnect
      this.reconnectionService.clearGap(normalizedChannel);
    };
    client.on("connected", connectedListener);
    this.connectedListeners.set(normalizedChannel, connectedListener);

    const disconnectedListener = () => {
      this.emitStatus(normalizedChannel, "disconnected");
      this.connectionStateService.clearRoomState(normalizedChannel);
    };
    client.on("disconnected", disconnectedListener);
    this.disconnectedListeners.set(normalizedChannel, disconnectedListener);

    const reconnectListener = () => {
      this.emitStatus(normalizedChannel, "reconnecting");
    };
    client.on("reconnect", reconnectListener);
    this.reconnectListeners.set(normalizedChannel, reconnectListener);
    const roomstateListener = (channel: string, state: tmi.RoomState) => {
      const slowValue = state.slow;
      const slowModeWaitTime =
        typeof slowValue === "string" ? parseInt(slowValue, 10) : slowValue ? 0 : undefined;

      const followersValue = state["followers-only"];
      const isFollowersOnly = followersValue === true || followersValue === "0";
      const followersOnlyMinutes =
        isFollowersOnly && typeof followersValue === "string" && followersValue !== "0"
          ? parseInt(followersValue, 10)
          : undefined;

      this.connectionStateService.updateRoomState(normalizedChannel, {
        isSlowMode: slowValue === true || (typeof slowValue === "string" && slowValue !== "0"),
        slowModeWaitTime: slowModeWaitTime,
        isFollowersOnly,
        followersOnlyMinutes,
        isSubscribersOnly: state["subs-only"] ?? false,
        isEmotesOnly: state["emote-only"] ?? false,
        isR9k: state.r9k ?? false,
      });
    };
    client.on("roomstate", roomstateListener);
    this.roomstateListeners.set(normalizedChannel, roomstateListener);

    // `tmi.js` runtime emits `connectionfailure`; types may not include it.
    type TmiClientWithConnectionFailure = tmi.Client & {
      on(event: "connectionfailure", listener: () => void): tmi.Client;
    };

    const failureListener = () => {
      this.errorService.reportNetworkTimeout(normalizedChannel, "twitch");
    };
    (client as unknown as TmiClientWithConnectionFailure).on("connectionfailure", failureListener);
    this.failureListeners.set(normalizedChannel, failureListener);

    const noticeListener = (reason: string) => {
      if (reason.includes("ratelimit") || reason.includes("rate limit")) {
        this.errorService.reportRateLimited(normalizedChannel, "twitch");
      }
    };
    client.on("notice", noticeListener);
    this.noticeListeners.set(normalizedChannel, noticeListener);

    void client.connect();
    this.clientsByChannel.set(normalizedChannel, client);
    this.connectedChannels.add(normalizedChannel);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    const client = this.clientsByChannel.get(normalizedChannel);

    if (client) {
      // Remove all event listeners to prevent memory leaks
      const messageListener = this.messageListeners.get(normalizedChannel);
      const connectedListener = this.connectedListeners.get(normalizedChannel);
      const disconnectedListener = this.disconnectedListeners.get(normalizedChannel);
      const reconnectListener = this.reconnectListeners.get(normalizedChannel);
      const roomstateListener = this.roomstateListeners.get(normalizedChannel);
      const failureListener = this.failureListeners.get(normalizedChannel);
      const noticeListener = this.noticeListeners.get(normalizedChannel);

      if (messageListener) client.removeListener("message", messageListener);
      if (connectedListener) client.removeListener("connected", connectedListener);
      if (disconnectedListener) client.removeListener("disconnected", disconnectedListener);
      if (reconnectListener) client.removeListener("reconnect", reconnectListener);
      if (roomstateListener) client.removeListener("roomstate", roomstateListener);
      if (failureListener) {
        type TmiClientWithConnectionFailure = tmi.Client & {
          removeListener(event: "connectionfailure", listener: () => void): tmi.Client;
        };
        (client as unknown as TmiClientWithConnectionFailure).removeListener(
          "connectionfailure",
          failureListener
        );
      }
      if (noticeListener) client.removeListener("notice", noticeListener);

      // Clean up listener maps
      this.messageListeners.delete(normalizedChannel);
      this.connectedListeners.delete(normalizedChannel);
      this.disconnectedListeners.delete(normalizedChannel);
      this.reconnectListeners.delete(normalizedChannel);
      this.roomstateListeners.delete(normalizedChannel);
      this.failureListeners.delete(normalizedChannel);
      this.noticeListeners.delete(normalizedChannel);

      void client.disconnect();
      this.clientsByChannel.delete(normalizedChannel);
    }

    this.connectedChannels.delete(normalizedChannel);
    this.emitStatus(normalizedChannel, "disconnected");
  }

  sendMessage(channelId: string, text: string): boolean {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    void this.sendMessageAsync(normalizedChannel, text);
    return true;
  }

  async sendMessageAsync(channelId: string, text: string): Promise<boolean> {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    const account = this.resolveAccountForChannel(normalizedChannel);
    const hasAuthIdentity =
      account?.authStatus === "authorized" &&
      !!account.username?.trim() &&
      !!account.accessToken?.trim();
    if (!hasAuthIdentity) {
      // Try to refresh if account exists but token is expired
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        const refreshed = await this.ensureValidAccount(account.id);
        if (!refreshed) {
          this.errorService.reportAuthFailed(normalizedChannel);
          return false;
        }
      } else {
        this.errorService.reportAuthFailed(normalizedChannel);
        return false;
      }
    }

    if (!this.clientsByChannel.has(normalizedChannel)) {
      this.connect(normalizedChannel);
      await this.delay(700);
    }

    let client = this.clientsByChannel.get(normalizedChannel);
    if (!client) {
      this.errorService.reportNetworkError(normalizedChannel, "Client not initialized");
      return false;
    }

    try {
      await client.say(normalizedChannel, trimmed);
      return true;
    } catch (error) {
      const message = String(error ?? "");
      if (
        message.toLowerCase().includes("anonymous") ||
        message.toLowerCase().includes("not connected")
      ) {
        this.errorService.reportWebSocketError(normalizedChannel, "twitch", true);
        this.disconnect(normalizedChannel);
        this.connect(normalizedChannel);
        await this.delay(900);
        client = this.clientsByChannel.get(normalizedChannel);
        if (!client) {
          return false;
        }

        try {
          await client.say(normalizedChannel, trimmed);
          return true;
        } catch {
          this.errorService.reportNetworkError(
            normalizedChannel,
            "Failed to send message after reconnect"
          );
          return false;
        }
      }

      this.errorService.reportNetworkError(normalizedChannel, `Send failed: ${message}`);
      return false;
    }
  }

  /**
   * Delete a message from chat (requires moderator/broadcaster permissions)
   */
  async deleteMessageAsync(channelId: string, messageId: string): Promise<boolean> {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();

    const account = this.resolveAccountForChannel(normalizedChannel);
    if (!account || account.authStatus !== "authorized" || !account.accessToken) {
      return false;
    }

    // Delete via Twitch Helix API through Tauri backend
    try {
      return await invoke<boolean>("twitchDeleteMessage", {
        channelId: normalizedChannel,
        messageId,
        accessToken: account.accessToken,
      });
    } catch (error) {
      this.logger.error("TwitchChatService", "Delete message error", error);
      return false;
    }
  }

  onStatusChange(
    listener: (channelId: string, status: TwitchConnectionStatus) => void
  ): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async fetchRobottyMessagesForUser(
    channelLogin: string,
    twitchUserId: string
  ): Promise<ChatMessage[]> {
    const all = await this.fetchRobottyHistoryForChannel(channelLogin);
    return all.filter((m) => m.sourceUserId === twitchUserId);
  }

  async loadChannelHistory(channelName: string, count: number = 100): Promise<ChatMessage[]> {
    const normalized = channelName.replace(/^#/, "").toLowerCase();
    const channelRef = buildChannelRef("twitch", normalized);

    try {
      const messages = await this.fetchRobottyHistoryForChannel(
        normalized,
        Math.ceil(count / 800) + 1
      );

      const existingMessages = this.chatStorageService.getMessagesByChannel(channelRef);
      const existingIds = new Set(existingMessages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));

      const hasMore = messages.length >= count;
      this.chatStorageService.setHistoryLoadState(channelRef, {
        loaded: true,
        hasMore,
        oldestMessageTimestamp:
          newMessages.length > 0 ? newMessages[newMessages.length - 1]?.timestamp : undefined,
      });

      return newMessages;
    } catch {
      return [];
    }
  }

  async fetchRobottyMessagesForUserPaginated(
    channelLogin: string,
    userId: string,
    options: { limit?: number; beforeTimestamp?: string } = {}
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    const { limit = 100 } = options;
    const all = await this.fetchRobottyHistoryForChannel(channelLogin);
    const filtered = all.filter((m) => m.sourceUserId === userId);

    let paginated = filtered;
    if (options.beforeTimestamp) {
      const beforeTime = new Date(options.beforeTimestamp).getTime();
      paginated = filtered.filter((m) => new Date(m.timestamp).getTime() < beforeTime);
    }

    paginated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const messages = paginated.slice(-limit);
    const hasMore = paginated.length > limit;

    return { messages, hasMore };
  }

  async fetchUserProfileImage(username: string): Promise<string | null> {
    return this.viewerCard.fetchUserProfileImage(username);
  }

  async fetchUserInfo(username: string) {
    return this.viewerCard.fetchUserInfo(username);
  }

  async fetchTwitchViewerCard(channelLogin: string, targetLogin: string) {
    return this.viewerCard.fetchTwitchViewerCard(channelLogin, targetLogin);
  }

  async fetchChannelProfileImage(channelLogin: string): Promise<string | null> {
    return this.viewerCard.fetchChannelProfileImage(channelLogin);
  }

  protected override getActionStates() {
    return {
      reply: createMessageActionState(
        "reply",
        "disabled",
        "Reply requires Twitch API integration (coming soon). tmi.js doesn't support replies."
      ),
      delete: createMessageActionState(
        "delete",
        "disabled",
        "This channel cannot delete messages."
      ),
    };
  }

  private buildMessageFromTmiPrivmsg(
    channelName: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean
  ): ChatMessage | null {
    const channel = this.chatListService
      .getChannels("twitch")
      .find((entry) => entry.channelName.toLowerCase() === channelName.toLowerCase());
    const account = this.authorizationService.getAccountById(channel?.accountId);

    const normalizedText = message.trim();
    if (!normalizedText) {
      return null;
    }

    const author = tags["display-name"] || tags.username || "Anonymous";
    const sourceUserId = tags["user-id"] || tags.username || "unknown";
    const sourceMessageId = tags.id || `tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const badges = this.extractBadges(tags);
    const roomId = tags["room-id"]?.toString();
    if (roomId) {
      void this.iconsCatalog.ensureChannelLoaded(roomId);
    }

    const emotes = this.extractEmotes(normalizedText, tags, roomId);
    const badgeIcons = this.extractBadgeIcons(tags, roomId);
    const timestamp = this.extractTimestamp(tags);
    const canDelete = channel?.accountCapabilities?.canDelete === true;
    const providerChannelId = channel?.channelId ?? channelName;

    return this.constructChatMessage(
      channelName,
      providerChannelId,
      sourceMessageId,
      sourceUserId,
      author,
      normalizedText,
      timestamp,
      badges,
      emotes,
      badgeIcons,
      canDelete,
      self,
      tags
    );
  }

  private extractBadges(tags: tmi.ChatUserstate): string[] {
    return Object.keys(tags.badges ?? {});
  }

  private extractEmotes(
    text: string,
    tags: tmi.ChatUserstate,
    roomId?: string
  ): ChatMessageEmote[] {
    return this.twitchEmotes.extractEmotesForTwitchMessage(text, tags.emotes, roomId);
  }

  private extractBadgeIcons(tags: tmi.ChatUserstate, roomId?: string): ChatBadgeIcon[] {
    return this.twitchEmotes.extractBadgeIconsForTwitchMessage(tags.badges, roomId);
  }

  private extractTimestamp(tags: tmi.ChatUserstate): string {
    const tsRaw = tags["tmi-sent-ts"];
    if (tsRaw !== undefined && tsRaw !== "") {
      const n = Number(tsRaw);
      if (Number.isFinite(n)) {
        return new Date(n).toISOString();
      }
    }
    return new Date().toISOString();
  }

  private constructChatMessage(
    channelName: string,
    providerChannelId: string,
    sourceMessageId: string,
    sourceUserId: string,
    author: string,
    normalizedText: string,
    timestamp: string,
    badges: string[],
    emotes: ChatMessageEmote[],
    badgeIcons: ChatBadgeIcon[],
    canDelete: boolean,
    self: boolean,
    tags: tmi.ChatUserstate
  ): ChatMessage {
    const replyParentId = tags["reply-parent-msg-id"];

    return {
      id: `msg-${sourceMessageId}`,
      platform: "twitch",
      sourceMessageId,
      sourceChannelId: providerChannelId,
      sourceUserId,
      author,
      text: normalizedText,
      timestamp,
      badges,
      isSupporter: this.isSupporter(badges),
      isOutgoing: self,
      isDeleted: false,
      canRenderInOverlay: true,
      replyToMessageId: replyParentId ? `msg-${replyParentId}` : undefined,
      actions: {
        reply: createMessageActionState(
          "reply",
          "disabled",
          "Reply requires Twitch API integration (coming soon)."
        ),
        delete: createMessageActionState(
          "delete",
          canDelete ? "available" : "disabled",
          canDelete ? undefined : "Need broadcaster/moderator role for this channel."
        ),
      },
      rawPayload: {
        providerEvent: "privmsg",
        providerChannelId: channelName,
        providerUserId: sourceUserId,
        preview: normalizedText.slice(0, 120),
        emotes,
        badgeIcons,
      },
      authorAvatarUrl: undefined,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchRobottyHistoryForChannel(
    channelLogin: string,
    maxPages?: number
  ): Promise<ChatMessage[]> {
    const normalized = channelLogin.replace(/^#/, "").toLowerCase();
    const merged: ChatMessage[] = [];
    const seenIds = new Set<string>();
    let beforeCursor: string | undefined;
    const maxPagesToLoad = maxPages ?? 40;

    for (let page = 0; page < maxPagesToLoad; page++) {
      const url = new URL(
        `${TwitchChatService.ROBOTTY_RECENT_MESSAGES}/${encodeURIComponent(normalized)}`
      );
      url.searchParams.set("limit", "800");
      url.searchParams.set("hide_moderated_messages", "true");
      if (beforeCursor !== undefined) {
        url.searchParams.set("before", beforeCursor);
      }

      try {
        const res = await fetch(url.toString());
        if (!res.ok) {
          if (res.status === 404) {
            this.errorService.reportChannelNotFound(normalized, "twitch");
          } else if (res.status >= 500) {
            this.errorService.reportNetworkError(
              normalized,
              `Robotty service unavailable (${res.status})`,
              true
            );
          }
          break;
        }

        const data = (await res.json()) as { messages?: string[] };
        const lines = data.messages;
        if (!Array.isArray(lines) || lines.length === 0) {
          break;
        }

        let pageMinRm = Infinity;
        for (const line of lines) {
          const tagMap = extractIrcTagMapFromLine(line);
          if (tagMap) {
            const rm = Number(tagMap["rm-received-ts"]);
            if (Number.isFinite(rm)) {
              pageMinRm = Math.min(pageMinRm, rm);
            }
          }
        }

        for (const line of lines) {
          const parsed = parseRecentMessagesPrivmsg(line, normalized);
          if (!parsed) {
            continue;
          }
          const messageModel = this.buildMessageFromTmiPrivmsg(
            normalized,
            parsed.tags,
            parsed.message,
            false
          );
          if (!messageModel || seenIds.has(messageModel.id)) {
            continue;
          }
          seenIds.add(messageModel.id);
          merged.push(messageModel);
        }

        if (lines.length < 800) {
          break;
        }
        if (pageMinRm === Infinity) {
          break;
        }
        beforeCursor = String(pageMinRm);
      } catch {
        this.errorService.reportNetworkError(
          normalized,
          "Failed to load chat history. Check your connection.",
          true
        );
        break;
      }
    }

    return merged;
  }

  private computeDeletePermission(
    authUsername: string | undefined,
    channelName: string,
    badges: string[]
  ): boolean {
    if (!authUsername) {
      return false;
    }

    const isBroadcaster = authUsername.toLowerCase() === channelName.toLowerCase();
    const isModerator = badges.includes("broadcaster") || badges.includes("moderator");
    return isBroadcaster || isModerator;
  }

  private resolveAccountForChannel(channelName: string) {
    const normalizedChannel = channelName.replace(/^#/, "").toLowerCase();
    const channel = this.chatListService
      .getChannels("twitch")
      .find(
        (entry) =>
          entry.channelId.toLowerCase() === normalizedChannel ||
          entry.channelName.toLowerCase() === normalizedChannel
      );

    const account = this.authorizationService.getAccountByIdSync(channel?.accountId);

    return account;
  }

  /**
   * Check if account token is expired and try to refresh
   */
  private async ensureValidAccount(accountId: string | undefined): Promise<boolean> {
    if (!accountId) {
      return false;
    }

    const account = this.authorizationService.getAccountByIdSync(accountId);
    if (!account) {
      return false;
    }

    // Check if token is expired
    if (account.authStatus === "tokenExpired" || account.authStatus === "revoked") {
      // Try to refresh the token
      const refreshed = await this.authorizationService.refreshAccountToken(account.id, "twitch");
      return refreshed;
    }

    // Check if token is about to expire (within 5 minutes)
    if (account.tokenExpiresAt) {
      const expiresAt = new Date(account.tokenExpiresAt);
      const now = new Date();
      const fiveMinutes = 5 * 60 * 1000;
      if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
        // Try to refresh proactively
        await this.authorizationService.refreshAccountToken(account.id, "twitch").catch(() => {
          // Ignore refresh errors, will fail gracefully
        });
      }
    }

    return account.authStatus === "authorized";
  }

  /**
   * Handle echo of own message from Twitch IRC
   * Finds the optimistic message and marks it as confirmed
   */
  private handleOwnMessageEcho(
    channelId: string,
    messageText: string,
    echoMessageId: string
  ): void {
    // Find recent outgoing messages in this channel
    const channelRef = buildChannelRef("twitch", channelId);
    const messages = this.chatStorageService.getMessagesByChannel(channelRef);

    // Look for optimistic message with matching text sent in last few seconds
    const now = Date.now();
    const maxAge = 5000; // 5 seconds

    const optimisticMessage = messages.find((msg) => {
      if (!msg.isOutgoing || msg.isDeleted) return false;
      if (msg.author !== "You") return false;

      // Check if text matches
      if (msg.text !== messageText) return false;

      // Check if message is recent (within 5 seconds)
      const messageTime = new Date(msg.timestamp).getTime();
      if (now - messageTime > maxAge) return false;

      // Check if it's still in pending state
      return msg.actions.delete.status === "pending" || msg.actions.delete.status === "available";
    });

    if (optimisticMessage) {
      // Mark the optimistic message as confirmed by updating its actions
      this.chatStorageService.updateMessage(channelRef, optimisticMessage.id, {
        actions: {
          reply: {
            kind: "reply",
            status: "disabled",
            reason: "Cannot reply to own message",
          },
          delete: {
            kind: "delete",
            status: "available",
          },
        },
        rawPayload: {
          ...optimisticMessage.rawPayload,
          providerEvent: "outgoing_sent_confirmed",
        },
      });
    }
  }

  private emitStatus(channelId: string, status: TwitchConnectionStatus): void {
    for (const listener of this.statusListeners) {
      listener(channelId, status);
    }
  }
}

export type TwitchConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
