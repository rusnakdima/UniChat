/* sys lib */
import { Injectable } from "@angular/core";
export type StorageValidator<T> = (value: unknown) => value is T;

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

@Injectable({
  providedIn: "root",
})
export class LocalStorageService {
  get<T>(key: string, defaultValue: T, validator?: StorageValidator<T>): T {
    const storedValue = localStorage.getItem(key);

    if (!storedValue) {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(storedValue);

      if (validator && validator(parsed)) {
        return parsed;
      }

      if (!validator) {
        return parsed as T;
      }

      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }
}
