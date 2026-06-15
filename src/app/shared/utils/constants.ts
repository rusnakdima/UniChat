/**
 * Application-wide constants
 * Centralized configuration values for maintainability
 */

// Reconnection delays
export const RECONNECTION_BASE_DELAY_MS = 1000;
export const RECONNECTION_MAX_DELAY_MS = 30000;
export const RECONNECTION_INITIAL_DELAY_MS = 100;
export const RECONNECT_DELAY_MS = 2500;

// Message handling
export const ECHO_DETECTION_TIMEOUT_MS = 5000;
export const OPTIMISTIC_MESSAGE_TIMEOUT_MS = 5000;
export const ACTIVITY_TRACKING_INTERVAL_MS = 5000;
export const OVERLAY_CONFIG_LOAD_DELAY_MS = 150;
export const DISCONNECT_GAP_THRESHOLD_MS = 5000;
export const CHAT_HISTORY_RECONNECT_DELAY_MS = 500;

// Cache TTL
export const CACHE_TTL_SHORT_MS = 5 * 60 * 1000;
export const CACHE_TTL_MEDIUM_MS = 24 * 60 * 60 * 1000;
export const CACHE_TTL_LONG_MS = 7 * 24 * 60 * 60 * 1000;

// Limits
export const MAX_MESSAGE_LENGTH = 3000;
export const MAX_CHAT_RESULTS = 200;
export const MAX_EMOTE_SIZE = 177;
export const MAX_NOTIFICATION_TEXT_LENGTH = 180;
export const MAX_NOTIFICATION_TEXT_TRUNCATE = 177;
export const RATE_LIMIT_CODE = 429;
export const YOUTUBE_BACKOFF_MAX_MS = 32000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 30000;
export const POLLING_INTERVAL_MS = 2000;
export const SAVE_SUCCESS_TIMEOUT_MS = 3000;
export const WAIT_FOR_ACCOUNTS_TIMEOUT_MS = 3000;

export const APP_CONFIG = {
  production: true,
  debug: typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true",
  MAX_MESSAGES_TOTAL: 1000,
  MAX_MESSAGES_PER_CHANNEL: 150,
  MESSAGE_CACHE_SIZE: 1000,
  ROBOTTY_HISTORY_MAX_PAGES: 40,
  RECONNECT_DELAY_MS: 2500,
  MESSAGE_TYPE_THRESHOLD_MS: 5 * 60 * 1000,
  CACHE_STALE_DAYS: 7,
  EMOTE_TTL_HOURS: 24,
  ERROR_BACKOFF_MINUTES: 15,
  DEFAULT_WIDGET_ID: "widget-main",
  MEMORY_CHECK_INTERVAL_MS: 60000,
  OLD_MESSAGE_AGE_MS: 30 * 60 * 1000,
  PRUNE_INTERVAL_MS: 5 * 60 * 1000,
} as const;

export const SCROLL_CONSTANTS = {
  DETACH_FROM_BOTTOM_PX: 100,
  REATTACH_TO_BOTTOM_PX: 150,
  SCROLL_NOISE_THRESHOLD_PX: 8,
  MESSAGE_ITEM_HEIGHT_PX: 80,
} as const;

export const TIME_CONSTANTS = {
  ONE_SECOND_MS: 1000,
  ONE_MINUTE_MS: 60 * 1000,
  ONE_HOUR_MS: 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const DENSITY_CONSTANTS = {
  COMPACT_GAP: "gap-3",
  COMPACT_PADDING: "p-3",
  COMPACT_TEXT: "text-xs leading-5",
  COMFORTABLE_GAP: "gap-4",
  COMFORTABLE_PADDING: "p-4",
  COMFORTABLE_TEXT: "text-sm leading-6",
} as const;

export const OVERLAY_CONSTANTS = {
  DEFAULT_PORT: 1450,
  MESSAGE_LIMIT_DEFAULT: 50,
  MESSAGE_LIMIT_MAX: 500,
} as const;

export const TWITCH_CONFIG = {
  HISTORY_PAGE_SIZE: 800,
  RECONNECT_DELAYS: { FIRST: 700, SECOND: 900 },
} as const;

export const GITHUB_USERNAME = "TechCraft-Solutions";
export const GITHUB_REPO_NAME = "UniChat";
export const GITHUB_REPO = `${GITHUB_USERNAME}/${GITHUB_REPO_NAME}`;
export const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

// Platform Icons
export const PLATFORM_TWITCH_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239146FF'%3E%3Cpath d='M2.149 0l-1.612 3.76v16.482h4.841v3.76h3.227l3.227-3.76h4.303l7.53-7.53V0H2.149zm18.82 12.967l-3.227 3.227h-4.303l-2.689 3.227v-3.227H6.453V2.149h14.516v10.818zm-3.764-6.453h-2.149v6.453h2.149V6.514zm-5.915 0H9.136v6.453h2.149V6.514z'/%3E%3C/svg%3E";
export const PLATFORM_KICK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2353FC18'%3E%3Cpath d='M4.5 3.75L3 24h4.5l1.5-12 3 12h4.5l4.5-20.25h-4.5l-3 13.5-3-13.5H4.5z'/%3E%3C/svg%3E";
export const PLATFORM_YOUTUBE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FF0000'%3E%3Cpath d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'/%3E%3C/svg%3E";

// Overlay storage keys
const OVERLAY_PREFIX = "unichat:overlay:";

export function overlayFilterOverrideKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:filter_override`;
}

export function overlayCustomCssKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:custom_css`;
}

export function overlayChannelIdsKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:channel_ids`;
}

export function overlayMaxMessagesKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:max_messages`;
}

export function overlayTextSizeKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:text_size`;
}

export function overlayAnimationTypeKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:animation_type`;
}

export function overlayAnimationDirectionKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:animation_direction`;
}

export function overlayTransparentBgKey(widgetId: string): string {
  return `${OVERLAY_PREFIX}${widgetId}:transparent_bg`;
}

export type AppConfig = typeof APP_CONFIG;
