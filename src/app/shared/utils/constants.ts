/**
 * Application-wide constants
 */

// Used: MAX_MESSAGES_PER_CHANNEL referenced in unified-storage.service.ts
export const APP_CONFIG = {
  production: true,
  debug: typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true",
  MAX_MESSAGES_TOTAL: 1000,
  MAX_MESSAGES_PER_CHANNEL: 150,
  MESSAGE_CACHE_SIZE: 1000,
} as const;

// Platform SVG icon data URLs
export const PLATFORM_TWITCH_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239146FF'%3E%3Cpath d='M2.149 0l-1.612 3.76v16.482h4.841v3.76h3.227l3.227-3.76h4.303l7.53-7.53V0H2.149zm18.82 12.967l-3.227 3.227h-4.303l-2.689 3.227v-3.227H6.453V2.149h14.516v10.818zm-3.764-6.453h-2.149v6.453h2.149V6.514zm-5.915 0H9.136v6.453h2.149V6.514z'/%3E%3C/svg%3E";
export const PLATFORM_KICK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2353FC18'%3E%3Cpath d='M4.5 3.75L3 24h4.5l1.5-12 3 12h4.5l4.5-20.25h-4.5l-3 13.5-3-13.5H4.5z'/%3E%3C/svg%3E";
export const PLATFORM_YOUTUBE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FF0000'%3E%3Cpath d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'/%3E%3C/svg%3E";

export type AppConfig = typeof APP_CONFIG;
