/**
 * Application-wide constants
 * Centralized configuration values for maintainability
 */

export const APP_CONFIG = {
  // Environment
  production: false,

  // Message limits (pairs with periodic prune + rAF-batched live ingress for 1000+ msg/min)
  MAX_MESSAGES_PER_CHANNEL: 2000,
  MAX_MESSAGES_TOTAL: 10000,
  MESSAGE_CACHE_SIZE: 10000,

  // History loading
  ROBOTTY_HISTORY_MAX_PAGES: 40,

  // Timing constants (milliseconds)
  RECONNECT_DELAY_MS: 2500,
  MESSAGE_TYPE_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes for "returning" user

  // Cache configuration
  CACHE_STALE_DAYS: 7,
  EMOTE_TTL_HOURS: 24, // Emote cache TTL

  // Error handling
  ERROR_BACKOFF_MINUTES: 15,

  // Default identifiers
  DEFAULT_WIDGET_ID: "widget-main",

  // Memory management
  MEMORY_CHECK_INTERVAL_MS: 60000, // Check every minute
  OLD_MESSAGE_AGE_MS: 30 * 60 * 1000, // 30 minutes
} as const;

/**
 * Scroll region constants for chat message display
 */
export const SCROLL_CONSTANTS = {
  DETACH_FROM_BOTTOM_PX: 100,
  REATTACH_TO_BOTTOM_PX: 150,
  SCROLL_NOISE_THRESHOLD_PX: 8,
  MESSAGE_ITEM_HEIGHT_PX: 80,
} as const;

/**
 * Time-related constants
 */
export const TIME_CONSTANTS = {
  ONE_SECOND_MS: 1000,
  ONE_MINUTE_MS: 60 * 1000,
  ONE_HOUR_MS: 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * UI density constants
 */
export const DENSITY_CONSTANTS = {
  COMPACT_GAP: "gap-3",
  COMPACT_PADDING: "p-3",
  COMPACT_TEXT: "text-xs leading-5",
  COMFORTABLE_GAP: "gap-4",
  COMFORTABLE_PADDING: "p-4",
  COMFORTABLE_TEXT: "text-sm leading-6",
} as const;

/**
 * Overlay constants
 */
export const OVERLAY_CONSTANTS = {
  DEFAULT_PORT: 37453,
  MESSAGE_LIMIT_DEFAULT: 50,
  MESSAGE_LIMIT_MAX: 500,
} as const;

/**
 * Type-safe access to app config
 */
export type AppConfig = typeof APP_CONFIG;
