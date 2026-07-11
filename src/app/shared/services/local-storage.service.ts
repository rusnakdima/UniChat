// Re-export LocalStorageService from @tauri-front/shared
export { LocalStorageService, type StorageValidator } from "@tauri-front/shared";

export const STORAGE_KEYS = {
  THEME: "unichat-theme",
  LANGUAGE: "unichat-language",
  YOUTUBE_API_KEY: "unichat-youtube-api-key",
  DEBUG_MODE: "unichat-debug",
  DASHBOARD_PREFERENCES: "unichat-dashboard-prefs",
  CHAT_CHANNELS: "unichat-chat-channels",
  CUSTOM_EMOTES: "unichat-custom-emotes",
  AUTHORIZATION_ACCOUNTS: "unichat-auth-accounts",
  KEYBOARD_SHORTCUTS: "unichat-keyboard-shortcuts",
  PINNED_MESSAGES: "unichat-pinned-messages",
  CHANNEL_IMAGES: "unichat-channel-images",
  HIGHLIGHT_NOTIFICATION: "unichat-highlight-notification",
  RULE_BASED_CONFIG: "unichat-rule-based",
  BLOCK_RESIZE: "unichat-block-resize",
  DEBUG_PANEL_SIZE: "debug-panel-size",
  DEBUG_PANEL_OPEN: "debug-panel-open",
} as const;
