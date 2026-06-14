import { inject } from "@angular/core";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import { RecentlySentMessage, KickUserInfo, KickChannelInfo } from "@models/platform-api.model";
import { generateTimestamp } from "@shared/utils/chat.helper";
import { PlatformType, RawPayloadMetadata, ChatMessageEmote } from "@models/chat.model";
import { TauriApiService } from "@app/api/tauri-api.service";
import { RATE_LIMIT_CODE, ECHO_DETECTION_TIMEOUT_MS } from "@shared/utils/constants";

interface OutgoingChatMessage {
  id: string;
  sourceMessageId: string;
  sourceUserId: string;
  author: string;
  text: string;
  badges: string[];
  timestamp: string | undefined;
  rawPayload: RawPayloadMetadata;
  authorAvatarUrl?: string;
  isOutgoing?: boolean;
}

interface ChatMessageUpdates {
  content: string;
  sourceUserId: string;
  sourceMessageId: string;
  isOutgoing: boolean;
}

export class KickChatMessageHandler {
  readonly platform = "kick" as const;

  private static readonly MAX_RECENTLY_SENT_MESSAGES = 100;
  private static readonly RECENTLY_SENT_MESSAGE_TTL_MS = 10 * 1000;

  private readonly recentlySentMessages = new Map<string, RecentlySentMessage>();
  private readonly historyNoticeLoggedChannels = new Set<string>();

  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);
  private readonly tauriApi = inject(TauriApiService);

  onOutgoingMessage?: (channelSlug: string, message: OutgoingChatMessage) => void;
  onMessageUpdate?: (channelSlug: string, messageId: string, updates: ChatMessageUpdates) => void;

  cleanupRecentlySentMessages(): void {
    const now = Date.now();
    for (const [key, value] of this.recentlySentMessages) {
      if (now - value.timestamp > KickChatMessageHandler.RECENTLY_SENT_MESSAGE_TTL_MS) {
        this.recentlySentMessages.delete(key);
      }
    }
    if (this.recentlySentMessages.size > KickChatMessageHandler.MAX_RECENTLY_SENT_MESSAGES) {
      const entriesToDelete =
        this.recentlySentMessages.size - KickChatMessageHandler.MAX_RECENTLY_SENT_MESSAGES;
      const keysToDelete = Array.from(this.recentlySentMessages.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.recentlySentMessages.delete(key);
      }
    }
  }

  processChatPayload(channelSlug: string, payload: Record<string, unknown>): void {
    const mapped = this.kickChatEventMapper.mapChatEventPayload(payload);

    if (!mapped) {
      return;
    }

    this.logger.debug(
      "Processing message",
      { source: "KickChatService", mappedSourceMessageId: mapped.sourceMessageId, content: mapped.content }
    );

    const messageKey = `${mapped.author}:${mapped.content}`;
    const sentInfo = this.recentlySentMessages.get(`${channelSlug}:${messageKey}`);

    this.logger.debug("Sent info check", { source: "KickChatService", sentInfo: sentInfo ? "FOUND" : "NOT FOUND" });

    if (sentInfo) {
      const now = Date.now();
      const sentTime = sentInfo.timestamp;
      if (now - sentTime < ECHO_DETECTION_TIMEOUT_MS) {
        this.logger.debug(
          "Echo detected - updating existing message, skipping add",
          { source: "KickChatService" }
        );

        this.onMessageUpdate?.(channelSlug, sentInfo.content, {
          content: sentInfo.content,
          sourceUserId: mapped.sourceUserId,
          sourceMessageId: mapped.sourceMessageId,
          isOutgoing: false,
        });

        this.recentlySentMessages.delete(`${channelSlug}:${messageKey}`);
        return;
      }
      this.recentlySentMessages.delete(`${channelSlug}:${messageKey}`);
    }

    this.logger.debug("Adding new message to storage", { source: "KickChatService", mappedSourceMessageId: mapped.sourceMessageId });

    this.onOutgoingMessage?.(channelSlug, {
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
    });
  }

  trackSentMessage(normalizedChannel: string, username: string, content: string): void {
    const messageKey = `${username}:${content}`;
    this.recentlySentMessages.set(`${normalizedChannel}:${messageKey}`, {
      username,
      content,
      timestamp: Date.now(),
    });
    this.cleanupRecentlySentMessages();
  }

  async sendMessage(
    channelId: string,
    text: string,
    account: { username: string; userId: string; accessToken?: string },
    fetchChannelInfo: (channelSlug: string, accessToken: string | null) => Promise<KickChannelInfo>
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
      const channelInfo = await fetchChannelInfo(normalizedChannel, account.accessToken);

      const response = await this.tauriApi.kickSendChatMessage({
        content: trimmed,
        accessToken: account.accessToken,
        broadcasterUserId: Number(channelInfo.broadcasterUserId),
        replyToMessageId: null,
      });

      if (response) {
        const timestamp = generateTimestamp();
        const messageId = `kick-outgoing-${Date.now()}`;

        this.onOutgoingMessage?.(normalizedChannel, {
          id: messageId,
          sourceMessageId: messageId,
          sourceUserId: `kick-${account.userId}`,
          author: account.username,
          text: trimmed,
          timestamp: timestamp,
          badges: [],
          isOutgoing: true,
          authorAvatarUrl: undefined,
          rawPayload: {
            providerEvent: "chat.message.sent",
            providerChannelId: normalizedChannel,
            providerUserId: account.userId,
            preview: trimmed.slice(0, 120),
          },
        });
      }

      return response;
    } catch (error) {
      const errorMessage = String(error ?? "");
      this.logger.error("Send message failed", error, { source: "KickChatService" });

      if (errorMessage.includes(RATE_LIMIT_CODE.toString()) || errorMessage.includes("Rate limit")) {
        this.logger.warn("Rate limit exceeded", { source: "KickChatService" });
      }

      return false;
    }
  }

  async fetchUserInfo(username: string): Promise<KickUserInfo | null> {
    try {
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

      const userInfo = await this.tauriApi.kickFetchUserInfo({ username }) as KickUserInfo;
      return userInfo;
    } catch {
      return null;
    }
  }
}
