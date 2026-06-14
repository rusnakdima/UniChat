/* models */
import {
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
import { extractYoutubeVideoId } from "@utils/youtube-url-parser.util";
// Create singleton instance for helper functions
let platformResolver: PlatformResolverService | null = null;

function getPlatformResolver(): PlatformResolverService {
  if (!platformResolver) {
    platformResolver = new PlatformResolverService();
  }
  return platformResolver;
}

export function generateTimestamp(): string {
  return new Date().toISOString();
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
  const grouped: Record<PlatformType, T[]> = {
    twitch: [],
    kick: [],
    youtube: [],
  };

  for (const item of items) {
    grouped[item.platform].push(item);
  }

  return grouped;
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
  const encodedWidgetId = encodeURIComponent(widgetId);
  return `http://127.0.0.1:${port}/overlay?widgetId=${encodedWidgetId}`;
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
  const timestamp = generateTimestamp();
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
  return extractYoutubeVideoId(raw) ?? "";
}
