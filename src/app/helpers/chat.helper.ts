/* models */
import {
  ChannelAccountCapabilities,
  ChatAccount,
  ChatChannel,
  ChatMessage,
  DensityMode,
  MessageAction,
  MessageActionKind,
  MessageActionStatus,
  PlatformCapabilities,
  PlatformStatus,
  PlatformType,
  WidgetConfig,
  WidgetFilter,
  WidgetStatus,
} from "@models/chat.model";

/* services */
import { PlatformResolverService } from "@services/core/platform-resolver.service";
// Create singleton instance for helper functions
let platformResolver: PlatformResolverService | null = null;

function getPlatformResolver(): PlatformResolverService {
  if (!platformResolver) {
    platformResolver = new PlatformResolverService();
  }
  return platformResolver;
}

export function sortMessagesByRecency(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
}

export function sortMessagesChronological(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
}

const BLANK_PIXEL_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Reject values that would become app-relative URLs in `<img src>` (e.g. bare `557341058` → `/557341058` → 404 spam).
 */
export function isSafeRemoteImageUrl(url: string | undefined | null): boolean {
  if (!url?.trim()) {
    return false;
  }
  const u = url.trim();
  return u.startsWith("https://") || u.startsWith("http://");
}

/** Stop repeat network errors after a failed emote/badge image load. */
export function silenceBrokenChatImage(ev: Event): void {
  const el = ev.target;
  if (!(el instanceof HTMLImageElement)) {
    return;
  }
  el.onerror = null;
  el.removeAttribute("srcset");
  el.src = BLANK_PIXEL_GIF;
  el.style.display = "none";
}

export function buildSplitFeed(messages: ChatMessage[]): Record<PlatformType, ChatMessage[]> {
  return groupByPlatform(messages);
}

/**
 * Group items by platform type
 * Utility function to avoid duplicate filtering logic
 */
export function groupByPlatform<T extends { platform: PlatformType }>(
  items: T[]
): Record<PlatformType, T[]> {
  return {
    twitch: items.filter((item) => item.platform === "twitch"),
    kick: items.filter((item) => item.platform === "kick"),
    youtube: items.filter((item) => item.platform === "youtube"),
  };
}

export function createMessageActionState(
  kind: MessageActionKind,
  status: MessageActionStatus,
  reason?: string
): MessageAction {
  return { kind, status, reason };
}

export function getPlatformLabel(platform: PlatformType): string {
  return getPlatformResolver().getDisplayName(platform);
}

export function getPlatformBadgeClasses(platform: PlatformType): string {
  return getPlatformResolver().getBadgeClasses(platform);
}

export function getPlatformBadgeClassesMixedFilter(
  platform: PlatformType,
  channelEnabled: boolean
): string {
  return getPlatformResolver().getMixedFilterBadgeClasses(platform, channelEnabled);
}

export function getStatusClasses(status: PlatformStatus | WidgetStatus): string {
  return getPlatformResolver().getStatusClasses(status);
}

export function getStatusLabel(status: PlatformStatus | WidgetStatus): string {
  return getPlatformResolver().getStatusLabel(status);
}

export function getWidgetSummary(widget: WidgetConfig, messages: ChatMessage[]): string {
  const filterLabel = widget.filter === "all" ? "All chat" : "Supporters only";
  return `${filterLabel} • ${messages.length} queued`;
}

export function groupChannelsByPlatform(
  channels: ChatChannel[]
): Record<PlatformType, ChatChannel[]> {
  return groupByPlatform(channels);
}

export function getAuthorizationUrl(platform: PlatformType): string {
  const baseUrl = "https://example.com/oauth";

  switch (platform) {
    case "twitch":
      return `${baseUrl}/twitch`;
    case "kick":
      return `${baseUrl}/kick`;
    case "youtube":
      return `${baseUrl}/youtube`;
  }
}

export function getDensityCardClasses(densityMode: DensityMode): string {
  return densityMode === "compact" ? "gap-3 rounded-[1.25rem] p-3" : "gap-4 rounded-[1.5rem] p-4";
}

export function getDensityTextClasses(densityMode: DensityMode): string {
  return densityMode === "compact" ? "text-xs leading-5" : "text-sm leading-6";
}

export function buildOverlayUrl(port: number, widgetId: string): string {
  return `http://127.0.0.1:${port}/overlay?widgetId=${widgetId}`;
}

export function getProviderCapabilities(
  platform: PlatformType,
  isAuthorized: boolean
): PlatformCapabilities {
  const resolver = getPlatformResolver();
  const capabilities = resolver.getCapabilities(platform);

  // If not authorized, downgrade capabilities to listen-only
  if (!isAuthorized) {
    return {
      canListen: true,
      canReply: false,
      canDelete: false,
    };
  }

  return capabilities;
}

export function getChannelAccountCapabilities(
  channel: Pick<ChatChannel, "platform" | "accountCapabilities">,
  account?: Pick<ChatAccount, "authStatus">
): ChannelAccountCapabilities {
  const base = getProviderCapabilities(channel.platform, account?.authStatus === "authorized");
  const moderation = channel.accountCapabilities;

  return {
    ...base,
    canDelete: base.canDelete && moderation?.verified === true && moderation.canDelete,
    canModerate: moderation?.verified === true && moderation.canModerate,
    moderationRole: moderation?.moderationRole ?? "viewer",
    verified: moderation?.verified ?? false,
  };
}

export interface CreateMessageOptions {
  id?: string;
  sourceMessageId?: string;
  sourceUserId?: string;
  author?: string;
  text?: string;
  badges?: string[];
  isSupporter?: boolean;
  isOutgoing?: boolean;
  replyToMessageId?: string;
  customActions?: Partial<ChatMessage["actions"]>;
  rawPayloadOverride?: Partial<ChatMessage["rawPayload"]>;
}

export function createChatMessage(
  platform: PlatformType,
  channelId: string,
  options: CreateMessageOptions = {}
): ChatMessage {
  const timestamp = new Date().toISOString();
  const userId = options.sourceUserId ?? `${platform}-user-${Date.now()}`;
  const messageId = options.id ?? `${platform}-${channelId}-${Date.now()}`;
  const sourceMessageId = options.sourceMessageId ?? messageId;

  const defaultActions: ChatMessage["actions"] = {
    reply: createMessageActionState("reply", "available"),
    delete: createMessageActionState("delete", "available"),
  };

  return {
    id: messageId,
    platform,
    sourceMessageId,
    sourceChannelId: channelId,
    sourceUserId: userId,
    author: options.author ?? "Anonymous",
    text: options.text ?? "",
    timestamp,
    badges: options.badges ?? [],
    isSupporter: options.isSupporter ?? false,
    isOutgoing: options.isOutgoing ?? false,
    isDeleted: false,
    canRenderInOverlay: true,
    replyToMessageId: options.replyToMessageId,
    actions: options.customActions
      ? { ...defaultActions, ...options.customActions }
      : defaultActions,
    rawPayload: {
      providerEvent: getProviderEventName(platform),
      providerChannelId: channelId,
      providerUserId: userId,
      preview: options.text ?? "",
      ...options.rawPayloadOverride,
    },
  };
}

function getProviderEventName(platform: PlatformType): string {
  switch (platform) {
    case "twitch":
      return "privmsg";
    case "kick":
      return "chat.message";
    case "youtube":
      return "liveChatMessage";
  }
}

/** Browser storage key for the YouTube Data API v3 key (read-only live chat). */
export const YOUTUBE_DATA_API_KEY_STORAGE_KEY = "unichat-youtube-api-key";

/**
 * Canonical id for a YouTube row in channel list: explicit 11-char video id.
 */
export function normalizeYouTubeProviderInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const studioMatch = trimmed.match(/studio\.youtube\.com\/video\/([a-zA-Z0-9_-]{11})/i);
  if (studioMatch?.[1]) {
    return studioMatch[1];
  }

  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (watchMatch?.[1] && /youtube\.com/i.test(trimmed)) {
    return watchMatch[1];
  }

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|#|\/|$)/i);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }

  const liveMatch = trimmed.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:\?|#|\/|$)/i);
  if (liveMatch?.[1]) {
    return liveMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return "";
}
