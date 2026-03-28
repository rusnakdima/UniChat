/**
 * Application-wide constants
 * Centralized configuration values for maintainability
 */

export const APP_CONFIG = {
  // Message limits
  MAX_MESSAGES_PER_CHANNEL: 2000, // Reduced from 4000 for better memory
  MAX_MESSAGES_TOTAL: 10000, // Global limit across all channels
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
 * Type-safe access to app config
 */
export type AppConfig = typeof APP_CONFIG;
