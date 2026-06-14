/* sys lib */
import { Injectable, inject } from "@angular/core";
import tmi from "tmi.js";

/* models */
import { ChatBadgeIcon, ChatMessage, ChatMessageEmote } from "@models/chat.model";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { ReconnectionService } from "@services/core/reconnection.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";
import { TwitchEmotesService } from "@services/providers/twitch-emotes.service";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { TwitchViewerCardService } from "@services/providers/twitch-viewer-card.service";
import { buildChannelRef } from "@utils/channel-ref.util";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import {
  extractIrcTagMapFromLine,
  parseRecentMessagesPrivmsg,
} from "@services/providers/twitch-robotty-privmsg.parser";
import { createMessageActionState } from "@shared/utils/chat.helper";

@Injectable({
  providedIn: "root",
})
export class TwitchMessageParserService {
  private static readonly ROBOTTY_RECENT_MESSAGES =
    "https://recent-messages.robotty.de/api/v2/recent-messages";

  private readonly logger = inject(LOGGER_SERVICE);
  private readonly errorService = inject(ConnectionErrorService);
  private readonly reconnectionService = inject(ReconnectionService);
  private readonly iconsCatalog = inject(IconsCatalogService);
  private readonly twitchEmotes = inject(TwitchEmotesService);
  private readonly chatStorageService = inject(ChatStorageService);
  private readonly chatListService = inject(ChatListService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly viewerCard = inject(TwitchViewerCardService);

  buildMessageFromTmiPrivmsg(
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

    const author = tags["display-name"] || tags["username"] || "Anonymous";
    const sourceUserId = tags["user-id"] || tags["username"] || "unknown";
    const sourceMessageId =
      tags["id"] || `tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const badges = this.extractBadges(tags);
    const roomId = tags["room-id"]?.toString();
    if (roomId) {
      void this.iconsCatalog.ensureChannelLoaded(roomId);
    }

    const emotes = this.extractEmotes(normalizedText, tags.emotes, roomId);
    const badgeIcons = this.extractBadgeIcons(tags.badges, roomId);
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
    emotesById: { [emoteId: string]: string[] } | undefined,
    roomId?: string
  ): ChatMessageEmote[] {
    return this.twitchEmotes.extractEmotesForTwitchMessage(text, emotesById, roomId);
  }

  private extractBadgeIcons(
    badges: Record<string, string | undefined> | undefined,
    roomId?: string
  ): ChatBadgeIcon[] {
    return this.twitchEmotes.extractBadgeIconsForTwitchMessage(badges, roomId);
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

  private isSupporter(badges: string[]): boolean {
    const supporterBadges = ["subscriber", "supporter", "member"];
    return badges?.some((badge) => supporterBadges.includes(badge)) ?? false;
  }

  async fetchRobottyHistoryForChannel(
    channelLogin: string,
    maxPages?: number
  ): Promise<ChatMessage[]> {
    const normalized = normalizeChannelId("twitch", channelLogin);
    const merged: ChatMessage[] = [];
    const seenIds = new Set<string>();
    let beforeCursor: string | undefined;
    const maxPagesToLoad = maxPages ?? 40;

    for (let page = 0; page < maxPagesToLoad; page++) {
      const url = new URL(
        `${TwitchMessageParserService.ROBOTTY_RECENT_MESSAGES}/${encodeURIComponent(normalized)}`
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
            parsed.tags as { [key: string]: string | undefined },
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

  async loadChannelHistory(channelName: string, count: number = 100): Promise<ChatMessage[]> {
    const normalized = normalizeChannelId("twitch", channelName);
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

  async fetchRobottyMessagesForUser(
    channelLogin: string,
    twitchUserId: string
  ): Promise<ChatMessage[]> {
    const all = await this.fetchRobottyHistoryForChannel(channelLogin);
    return all.filter((m) => m.sourceUserId === twitchUserId);
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

  handleOwnMessageEcho(channelId: string, messageText: string, echoMessageId: string): void {
    const channelRef = buildChannelRef("twitch", channelId);
    const messages = this.chatStorageService.getMessagesByChannel(channelRef);

    const now = Date.now();
    const maxAge = 5000;

    const optimisticMessage = messages.find((msg) => {
      if (!msg.isOutgoing || msg.isDeleted) return false;
      if (msg.author !== "You") return false;
      if (msg.text !== messageText) return false;
      const messageTime = new Date(msg.timestamp).getTime();
      if (now - messageTime > maxAge) return false;
      return msg.actions.delete.status === "pending" || msg.actions.delete.status === "available";
    });

    if (optimisticMessage) {
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
}
