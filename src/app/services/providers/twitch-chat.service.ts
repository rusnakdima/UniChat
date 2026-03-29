/* sys lib */
import { Injectable, inject } from "@angular/core";
import tmi from "tmi.js";

/* models */
import { ChatBadgeIcon, ChatHistoryLoadState, ChatMessage } from "@models/chat.model";

/* services */
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";
import { TwitchEmotesService } from "@services/providers/twitch-emotes.service";
import { ReconnectionService } from "@services/core/reconnection.service";
import { buildChannelRef } from "@utils/channel-ref.util";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";
export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  banner?: string | null;
  created_at: string;
}

/**
 * Interface for Twitch GraphQL ViewerCard response
 */
interface TwitchGraphQLViewerCard {
  data?: {
    user?: {
      id?: string;
      login?: string;
      displayName?: string;
      description?: string;
      profileImageURL?: string;
      offlineImageUrl?: string;
      createdAt?: string;
      chatColor?: string;
      roles?: {
        isAffiliate?: boolean;
        isPartner?: boolean;
        isStaff?: boolean;
        isAdmin?: boolean;
        isGlobalMod?: boolean;
      };
      badges?: Array<{
        id?: string;
        title?: string;
        image?: {
          url_1x?: string;
          url_2x?: string;
          url_4x?: string;
        };
      }>;
      chatRoomRules?: string[];
      primaryColorHex?: string;
      follow?: {
        followedAt?: string;
      };
      stream?: {
        id?: string;
        previewImage?: {
          url?: string;
        };
      };
      panels?: {
        id?: string;
        data?: {
          title?: string;
          description?: string;
          image?: {
            url?: string;
          };
          link?: {
            url?: string;
          };
        };
      }[];
      videos?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string;
            previewURL?: string;
            viewCount?: number;
            createdAt?: string;
          };
        }>;
      };
      clips?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string;
            thumbnailURL?: string;
            viewCount?: number;
            createdAt?: string;
          };
        }>;
      };
      channel?: {
        id?: string;
      };
    };
  };
  errors?: Array<{
    message?: string;
  }>;
}

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
  private readonly statusListeners = new Set<
    (channelId: string, status: TwitchConnectionStatus) => void
  >();
  private readonly iconsCatalog = inject(IconsCatalogService);
  private readonly twitchEmotes = inject(TwitchEmotesService);
  private readonly errorService = inject(ConnectionErrorService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly reconnectionService = inject(ReconnectionService);

  override connect(channelId: string): void {
    void this.iconsCatalog.ensureGlobalLoaded();
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    if (!normalizedChannel || this.clientsByChannel.has(normalizedChannel)) {
      return;
    }
    this.emitStatus(normalizedChannel, "connecting");

    const account = this.resolveAccountForChannel(normalizedChannel);
    const client = new tmi.Client({
      options: {
        skipUpdatingEmotesets: true,
      },
      channels: [normalizedChannel],
      connection: { reconnect: true, secure: true },
      identity:
        account?.authStatus === "authorized"
          ? {
              username: account.username.toLowerCase(),
              password: account.accessToken ? `oauth:${account.accessToken}` : undefined,
            }
          : undefined,
    });

    client.on(
      "message",
      (_channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => {
        const messageModel = this.buildMessageFromTmiPrivmsg(
          normalizedChannel,
          tags,
          message,
          self
        );
        if (messageModel) {
          // Add received timestamp for gap detection
          messageModel.receivedAt = Date.now();

          // Track message for gap detection
          this.reconnectionService.trackMessage(normalizedChannel, messageModel, "twitch");

          this.chatStorageService.addMessage(normalizedChannel, messageModel);
        }
      }
    );

    client.on("connected", () => {
      this.emitStatus(normalizedChannel, "connected");
      this.errorService.clearError(normalizedChannel);
      // Clear gap indicator on successful reconnect
      this.reconnectionService.clearGap(normalizedChannel);
      // Don't load initial messages - only show new messages from current session
      // Old messages will be loaded only when user clicks "Load Previous Messages"
    });
    client.on("disconnected", () => {
      this.emitStatus(normalizedChannel, "disconnected");
      this.connectionStateService.clearRoomState(normalizedChannel);
    });
    client.on("reconnect", () => {
      this.emitStatus(normalizedChannel, "reconnecting");
    });
    client.on("roomstate", (channel: string, state: tmi.RoomState) => {
      // Handle Twitch room state changes (slow mode, followers-only, etc.)
      // Note: tmi.js uses string "0" or "-1" for slow mode, parse accordingly
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
    });
    // @ts-ignore - tmi.js emits connectionfailure but not in types
    client.on("connectionfailure", () => {
      this.errorService.reportNetworkTimeout(normalizedChannel, "twitch");
    });
    client.on("notice", (reason: string) => {
      // Handle Twitch-specific notices like MSG_RATELIMITED, MSG_REJECTED, etc.
      if (reason.includes("ratelimit") || reason.includes("rate limit")) {
        this.errorService.reportRateLimited(normalizedChannel, "twitch");
      }
    });

    void client.connect();
    this.clientsByChannel.set(normalizedChannel, client);
    this.connectedChannels.add(normalizedChannel);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    const client = this.clientsByChannel.get(normalizedChannel);
    if (client) {
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
      this.errorService.reportAuthFailed(normalizedChannel);
      return false;
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

  async sendReplyAsync(channelId: string, sourceMessageId: string, text: string): Promise<boolean> {
    const normalizedChannel = channelId.replace(/^#/, "").toLowerCase();
    const trimmed = text.trim();
    if (!trimmed || !sourceMessageId) {
      return false;
    }

    const account = this.resolveAccountForChannel(normalizedChannel);
    const hasAuthIdentity =
      account?.authStatus === "authorized" &&
      !!account.username?.trim() &&
      !!account.accessToken?.trim();
    if (!hasAuthIdentity) {
      this.errorService.reportAuthFailed(normalizedChannel);
      return false;
    }

    if (!this.clientsByChannel.has(normalizedChannel)) {
      this.connect(normalizedChannel);
      await this.delay(700);
    }

    const client = this.clientsByChannel.get(normalizedChannel);
    if (!client) {
      return false;
    }

    try {
      const replyCapable = client as tmi.Client & {
        reply?: (channel: string, message: string, parentId: string) => Promise<unknown>;
      };
      if (typeof replyCapable.reply === "function") {
        await replyCapable.reply(normalizedChannel, trimmed, sourceMessageId);
      } else {
        await client.say(normalizedChannel, trimmed);
      }
      return true;
    } catch (error) {
      this.errorService.reportNetworkError(
        normalizedChannel,
        `Reply failed: ${String(error ?? "unknown error")}`
      );
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

  /**
   * Pulls everything Robotty currently stores for this channel (paginates with `before=` cursors).
   * Twitch's website popout uses Twitch-internal APIs; this is the best-available public substitute.
   */
  async fetchRobottyMessagesForUser(
    channelLogin: string,
    twitchUserId: string
  ): Promise<ChatMessage[]> {
    const all = await this.fetchRobottyHistoryForChannel(channelLogin);
    return all.filter((m) => m.sourceUserId === twitchUserId);
  }

  /**
   * Load previous history for a channel (called manually by user)
   */
  async loadChannelHistory(channelName: string, count: number = 100): Promise<ChatMessage[]> {
    const normalized = channelName.replace(/^#/, "").toLowerCase();
    const channelRef = buildChannelRef("twitch", normalized);

    try {
      const messages = await this.fetchRobottyHistoryForChannel(
        normalized,
        Math.ceil(count / 800) + 1
      );

      // Get existing messages to avoid duplicates
      const existingMessages = this.chatStorageService.getMessagesByChannel(channelRef);
      const existingIds = new Set(existingMessages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));

      // Update history load state
      const hasMore = messages.length >= count;
      this.chatStorageService.setHistoryLoadState(channelRef, {
        loaded: true,
        hasMore,
        oldestMessageTimestamp:
          newMessages.length > 0 ? newMessages[newMessages.length - 1]?.timestamp : undefined,
      });

      return newMessages;
    } catch (error) {
      console.warn("Failed to load channel history:", error);
      return [];
    }
  }

  /**
   * Fetch messages for a user with pagination support
   */
  async fetchRobottyMessagesForUserPaginated(
    channelLogin: string,
    userId: string,
    options: { limit?: number; beforeTimestamp?: string } = {}
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    const { limit = 100 } = options;
    const all = await this.fetchRobottyHistoryForChannel(channelLogin);
    const filtered = all.filter((m) => m.sourceUserId === userId);

    // If we have a beforeTimestamp, filter messages older than that
    let paginated = filtered;
    if (options.beforeTimestamp) {
      const beforeTime = new Date(options.beforeTimestamp).getTime();
      paginated = filtered.filter((m) => new Date(m.timestamp).getTime() < beforeTime);
    }

    // Sort chronologically (oldest first) for pagination
    paginated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Take the most recent 'limit' messages from the filtered set
    const messages = paginated.slice(-limit);
    const hasMore = paginated.length > limit;

    return { messages, hasMore };
  }

  /**
   * Fetch Twitch user profile image from Twitch CDN (public, no auth required)
   * Uses the predictable Twitch profile image URL pattern
   * @param username - Twitch username (case-insensitive)
   * @returns Profile image URL or null
   */
  async fetchUserProfileImage(username: string): Promise<string | null> {
    try {
      const info =
        (await this.fetchTwitchViewerCard(username, username)) ??
        (await this.fetchUserInfo(username));
      return info?.profile_image_url?.trim() ? info.profile_image_url : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch Twitch user info (no API call - returns basic info only)
   * @param username - Twitch username
   * @returns Basic user info with generated profile URL
   */
  async fetchUserInfo(username: string): Promise<TwitchUserInfo | null> {
    const viewerCard = await this.fetchTwitchViewerCard(username, username);
    if (viewerCard) {
      return viewerCard;
    }

    return {
      id: "",
      login: username.toLowerCase(),
      display_name: username,
      description: "",
      profile_image_url: "",
      offline_image_url: "",
      banner: null,
      created_at: "",
    };
  }

  /**
   * Fetch Twitch user viewer card from GraphQL API
   * This is the same API Twitch's frontend uses - no auth required for public data
   * @param channelLogin - The channel login name (e.g., "milanrodd")
   * @param targetLogin - The target user login name (e.g., "radio86pk")
   * @returns User info from GraphQL API
   */
  async fetchTwitchViewerCard(
    channelLogin: string,
    targetLogin: string
  ): Promise<(TwitchUserInfo & { chatColor?: string; badges?: ChatBadgeIcon[] }) | null> {
    const url = "https://gql.twitch.tv/gql";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        body: JSON.stringify([
          {
            operationName: "ViewerCard",
            variables: {
              channelID: "",
              channelIDStr: "",
              channelLogin: channelLogin.toLowerCase(),
              targetLogin: targetLogin.toLowerCase(),
              isViewerBadgeCollectionEnabled: true,
            },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: "c02d0aa3e6fdaad9a668f354236e0ded00e338cb742da33bb166e0f34ebf3c3b",
              },
            },
          },
        ]),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as TwitchGraphQLViewerCard[];
      const result = data[0];

      if (!result?.data?.user) {
        return null;
      }

      const user = result.data.user;

      // Parse badges from GraphQL response
      const badges: ChatBadgeIcon[] = [];
      if (user.badges) {
        for (const badge of user.badges) {
          if (badge.id && badge.title && badge.image?.url_1x) {
            badges.push({
              id: badge.id,
              label: badge.title,
              url: badge.image.url_1x,
            });
          }
        }
      }

      return {
        id: user.id ?? "",
        login: user.login ?? targetLogin.toLowerCase(),
        display_name: user.displayName ?? targetLogin,
        description: user.description ?? "",
        profile_image_url: user.profileImageURL ?? "",
        offline_image_url: user.offlineImageUrl ?? "",
        banner: user.primaryColorHex ?? null,
        created_at: user.createdAt ?? "",
        chatColor: user.chatColor,
        badges,
      };
    } catch (error) {
      // Ignore network errors
      return null;
    }
  }

  /**
   * Fetch channel profile image from Twitch CDN (no auth required)
   */
  async fetchChannelProfileImage(channelLogin: string): Promise<string | null> {
    const info = await this.fetchUserInfo(channelLogin);
    return info?.profile_image_url?.trim() ? info.profile_image_url : null;
  }

  // Unused for Twitch because action states are computed per message and role.
  protected override getActionStates() {
    return {
      reply: createMessageActionState("reply", "disabled"),
      delete: createMessageActionState("delete", "disabled"),
    };
  }

  private buildMessageFromTmiPrivmsg(
    channelName: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean
  ): ChatMessage | null {
    // Look up channel by name (channelName is the login name like "bratishkinoff")
    const channel = this.chatListService
      .getChannels("twitch")
      .find((entry) => entry.channelName.toLowerCase() === channelName.toLowerCase());
    const account = this.authorizationService.getAccountById(channel?.accountId);
    const badges = Object.keys(tags.badges ?? {});
    const author = tags["display-name"] || tags.username || "Anonymous";
    const sourceUserId = tags["user-id"] || tags.username || "unknown";
    const sourceMessageId = tags.id || `tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const normalizedText = message.trim();
    if (!normalizedText) {
      return null;
    }
    const replyParentId = tags["reply-parent-msg-id"];
    const roomId = tags["room-id"]?.toString();
    if (roomId) {
      void this.iconsCatalog.ensureChannelLoaded(roomId);
    }
    const emotes = this.twitchEmotes.extractEmotesForTwitchMessage(
      normalizedText,
      tags.emotes,
      roomId
    );
    const badgeIcons = this.twitchEmotes.extractBadgeIconsForTwitchMessage(tags.badges, roomId);

    const canDelete = channel?.accountCapabilities?.canDelete === true;

    const tsRaw = tags["tmi-sent-ts"];
    let timestamp = new Date().toISOString();
    if (tsRaw !== undefined && tsRaw !== "") {
      const n = Number(tsRaw);
      if (Number.isFinite(n)) {
        timestamp = new Date(n).toISOString();
      }
    }

    // Build author avatar URL from Twitch CDN
    const authorAvatarUrl = undefined;

    // Use provider channel ID for consistent channel filtering in overlay
    const providerChannelId = channel?.channelId ?? channelName;
    console.log('[TwitchChat] Building message - channelName:', channelName, 'found channel:', channel?.channelId, 'using providerChannelId:', providerChannelId);

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
          account?.authStatus === "authorized" ? "available" : "disabled",
          account?.authStatus === "authorized"
            ? undefined
            : "Need linked Twitch account authorized to reply."
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
      authorAvatarUrl,
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
          console.warn(`[TwitchChat] Failed to fetch recent messages from Robotty: ${res.status}`);
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
          const tagMap = TwitchChatService.extractIrcTagMapFromLine(line);
          if (tagMap) {
            const rm = Number(tagMap["rm-received-ts"]);
            if (Number.isFinite(rm)) {
              pageMinRm = Math.min(pageMinRm, rm);
            }
          }
        }

        for (const line of lines) {
          const parsed = this.parseRecentMessagesPrivmsg(line, normalized);
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
      } catch (error) {
        console.warn(`[TwitchChat] Error fetching recent messages from Robotty:`, error);
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

  private static extractIrcTagMapFromLine(line: string): Record<string, string> | null {
    if (!line.startsWith("@")) {
      return null;
    }
    const sep = line.indexOf(" :");
    if (sep === -1) {
      return null;
    }
    const tagString = line.slice(1, sep);
    const tagMap: Record<string, string> = {};
    for (const part of tagString.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) {
        continue;
      }
      tagMap[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return tagMap;
  }

  private parseRecentMessagesPrivmsg(
    line: string,
    expectedChannel: string
  ): { tags: tmi.ChatUserstate; message: string } | null {
    const privIdx = line.indexOf(" PRIVMSG ");
    if (privIdx === -1 || !line.startsWith("@")) {
      return null;
    }
    const sep = line.indexOf(" :");
    if (sep === -1 || sep > privIdx) {
      return null;
    }
    const rest = line.slice(sep + 2);
    const privmsgIdx = rest.indexOf(" PRIVMSG ");
    if (privmsgIdx === -1) {
      return null;
    }
    const nickPart = rest.slice(0, privmsgIdx);
    const nick = nickPart.includes("!") ? nickPart.slice(0, nickPart.indexOf("!")) : nickPart;
    const afterPriv = rest.slice(privmsgIdx + " PRIVMSG ".length).trimStart();
    if (!afterPriv.startsWith("#")) {
      return null;
    }
    const spaceAfterChan = afterPriv.indexOf(" ");
    if (spaceAfterChan === -1) {
      return null;
    }
    const chan = afterPriv.slice(1, spaceAfterChan).toLowerCase();
    if (chan !== expectedChannel.toLowerCase()) {
      return null;
    }
    let message = afterPriv.slice(spaceAfterChan + 1);
    if (message.startsWith(":")) {
      message = message.slice(1);
    }

    const tagMap = TwitchChatService.extractIrcTagMapFromLine(line);
    if (!tagMap) {
      return null;
    }

    const tags = this.rawIrcTagsToUserstate(tagMap, nick);
    return { tags, message };
  }

  private rawIrcTagsToUserstate(
    raw: Record<string, string>,
    fallbackNick: string
  ): tmi.ChatUserstate {
    const badges: tmi.Badges = {};
    if (raw["badges"]) {
      for (const seg of raw["badges"].split(",")) {
        if (!seg) {
          continue;
        }
        const slash = seg.indexOf("/");
        if (slash === -1) {
          badges[seg] = "1";
        } else {
          badges[seg.slice(0, slash)] = seg.slice(slash + 1);
        }
      }
    }

    const emotes: { [emoteId: string]: string[] } = {};
    if (raw["emotes"]) {
      for (const segment of raw["emotes"].split("/")) {
        if (!segment) {
          continue;
        }
        const colon = segment.indexOf(":");
        if (colon === -1) {
          continue;
        }
        const id = segment.slice(0, colon);
        const ranges = segment
          .slice(colon + 1)
          .split(",")
          .filter(Boolean);
        if (ranges.length) {
          emotes[id] = ranges;
        }
      }
    }

    const displayName = raw["display-name"];
    const login =
      raw["login"]?.trim() || fallbackNick.trim().toLowerCase() || displayName?.toLowerCase();

    return {
      "display-name": displayName,
      "user-id": raw["user-id"],
      username: login,
      id: raw["id"],
      "room-id": raw["room-id"],
      "reply-parent-msg-id": raw["reply-parent-msg-id"],
      color: raw["color"],
      "tmi-sent-ts": raw["tmi-sent-ts"],
      badges,
      emotes,
    } as tmi.ChatUserstate;
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
    return this.authorizationService.getAccountById(channel?.accountId);
  }

  private emitStatus(channelId: string, status: TwitchConnectionStatus): void {
    for (const listener of this.statusListeners) {
      listener(channelId, status);
    }
  }
}

export type TwitchConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
