/**
 * Channel normalization utilities
 * Provides consistent channel ID normalization across all platforms
 */

import { PlatformType } from "@models/chat.model";

/**
 * Normalize a channel ID based on platform-specific rules
 */
export function normalizeChannelId(platform: PlatformType, id: string): string {
  switch (platform) {
    case "twitch":
    case "kick":
      return normalizeTwitchKickChannel(id);
    case "youtube":
      return normalizeYouTubeChannel(id);
    default:
      return id.trim().toLowerCase();
  }
}

/**
 * Normalize Twitch or Kick channel ID
 * - Remove leading # if present
 * - Trim whitespace
 * - Convert to lowercase
 */
function normalizeTwitchKickChannel(id: string): string {
  return id.replace(/^#/, "").trim().toLowerCase();
}

/**
 * Normalize YouTube channel identifier
 * Handles various formats:
 * - Channel IDs (UC...)
 * - Channel names (@username)
 * - Full URLs
 */
export function normalizeYouTubeChannel(input: string): string {
  input = input.trim();

  // Handle YouTube URL formats
  const patterns = [
    // Channel URL: youtube.com/channel/UC...
    /^https?:\/\/(?:www\.)?youtube\.com\/channel\/([a-zA-Z0-9_-]+)$/,
    // Handle URL: youtube.com/@username
    /^https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9_-]+)$/,
    // Short URL: youtu.be/...
    /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)$/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Handle @username format
  if (input.startsWith("@")) {
    return input.slice(1).toLowerCase();
  }

  return input.toLowerCase();
}

/**
 * Normalize channel name for display purposes
 * Preserves original casing but trims whitespace
 */
export function normalizeChannelDisplayName(platform: PlatformType, name: string): string {
  switch (platform) {
    case "twitch":
    case "kick":
      return name.trim();
    case "youtube":
      return name.trim();
    default:
      return name.trim();
  }
}
