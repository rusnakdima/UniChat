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

const platformBadgeClasses: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-500/15 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-500/30 dark:bg-fuchsia-500/20 dark:text-fuchsia-200 dark:ring-fuchsia-400/30",
  kick: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30",
  youtube:
    "bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-400/30",
};

/** Mixed filter bar: channel disabled (muted pill) — strong label contrast on light/dark surfaces */
const platformBadgeClassesMixedDisabled: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-200/90 text-fuchsia-950 ring-1 ring-inset ring-fuchsia-600/40 dark:bg-fuchsia-950/55 dark:text-fuchsia-100 dark:ring-fuchsia-400/35",
  kick: "bg-emerald-200/90 text-emerald-950 ring-1 ring-inset ring-emerald-600/40 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-400/35",
  youtube:
    "bg-rose-200/90 text-rose-950 ring-1 ring-inset ring-rose-600/40 dark:bg-rose-950/55 dark:text-rose-100 dark:ring-rose-400/35",
};

/** Mixed filter bar: channel enabled (solid slate pill) — light labels on dark btn, crisp chips on light btn */
const platformBadgeClassesMixedEnabled: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-500/50 text-white ring-1 ring-inset ring-fuchsia-200/40 dark:bg-fuchsia-700 dark:text-white dark:ring-fuchsia-900/50",
  kick: "bg-emerald-500/50 text-white ring-1 ring-inset ring-emerald-200/40 dark:bg-emerald-700 dark:text-white dark:ring-emerald-900/50",
  youtube:
    "bg-rose-500/50 text-white ring-1 ring-inset ring-rose-200/40 dark:bg-rose-700 dark:text-white dark:ring-rose-900/50",
};

const statusClasses: Record<PlatformStatus | WidgetStatus, string> = {
  disconnected:
    "bg-slate-500/15 text-slate-700 ring-1 ring-inset ring-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-400/30",
  connecting:
    "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30",
  connected:
    "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30",
  reconnecting:
    "bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/30",
  live: "bg-cyan-500/15 text-cyan-700 ring-1 ring-inset ring-cyan-500/30 dark:bg-cyan-500/20 dark:text-cyan-200 dark:ring-cyan-400/30",
  draft:
    "bg-slate-500/15 text-slate-700 ring-1 ring-inset ring-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-400/30",
};

const statusLabels: Record<PlatformStatus | WidgetStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  live: "Live",
  draft: "Draft",
};

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
  return {
    twitch: messages.filter((message) => message.platform === "twitch"),
    kick: messages.filter((message) => message.platform === "kick"),
    youtube: messages.filter((message) => message.platform === "youtube"),
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
  if (platform === "youtube") {
    return "YouTube";
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export function getPlatformBadgeClasses(platform: PlatformType): string {
  return platformBadgeClasses[platform];
}

export function getPlatformBadgeClassesMixedFilter(
  platform: PlatformType,
  channelEnabled: boolean
): string {
  return channelEnabled
    ? platformBadgeClassesMixedEnabled[platform]
    : platformBadgeClassesMixedDisabled[platform];
}

export function getStatusClasses(status: PlatformStatus | WidgetStatus): string {
  return statusClasses[status];
}

export function getStatusLabel(status: PlatformStatus | WidgetStatus): string {
  return statusLabels[status];
}

export function getWidgetSummary(widget: WidgetConfig, messages: ChatMessage[]): string {
  const filterLabel = widget.filter === "all" ? "All chat" : "Supporters only";
  return `${filterLabel} • ${messages.length} queued`;
}

export function groupChannelsByPlatform(
  channels: ChatChannel[]
): Record<PlatformType, ChatChannel[]> {
  return {
    twitch: channels.filter((channel) => channel.platform === "twitch"),
    kick: channels.filter((channel) => channel.platform === "kick"),
    youtube: channels.filter((channel) => channel.platform === "youtube"),
  };
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
  if (!isAuthorized) {
    return {
      canListen: true,
      canReply: false,
      canDelete: false,
    };
  }

  if (platform === "youtube") {
    return {
      canListen: true,
      canReply: true,
      canDelete: false,
    };
  }

  return {
    canListen: true,
    canReply: true,
    canDelete: true,
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
 * Canonical id for a YouTube row in channel list: @handle (no @), UC… id, or v: + video id from URLs.
 */
export function normalizeYouTubeProviderInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const studioMatch = trimmed.match(/studio\.youtube\.com\/video\/([a-zA-Z0-9_-]{11})/i);
  if (studioMatch?.[1]) {
    return `v:${studioMatch[1]}`;
  }

  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (watchMatch?.[1] && /youtube\.com/i.test(trimmed)) {
    return `v:${watchMatch[1]}`;
  }

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|#|\/|$)/i);
  if (shortMatch?.[1]) {
    return `v:${shortMatch[1]}`;
  }

  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (channelMatch?.[1]) {
    return channelMatch[1];
  }

  const handleMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/i);
  if (handleMatch?.[1]) {
    return handleMatch[1].toLowerCase();
  }

  const atHandle = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
  if (atHandle !== trimmed) {
    return atHandle.toLowerCase();
  }

  if (/^UC[\w-]{22}$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/^@/, "").toLowerCase();
}
