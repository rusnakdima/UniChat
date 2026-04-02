/**
 * Platform-specific API response types
 * These interfaces represent data structures returned from platform APIs
 */

/**
 * Kick.com user information
 */
export interface KickUserInfo {
  id: string;
  username: string;
  bio: string;
  profile_pic_url: string;
}

/**
 * Kick.com channel information
 */
export interface KickChannelInfo {
  chatroomId: number;
  broadcasterUserId: number;
}

/**
 * Kick.com channel info with image URL
 */
export interface KickChannelInfoWithImage {
  id: number;
  user_id: number;
  username: string;
  profile_pic_url: string | null;
}

/**
 * Kick.com emote information
 */
export interface KickEmoteInfo {
  id: number;
  name: string;
}

/**
 * Twitch user information
 */
export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  offline_image_url?: string;
  banner?: string | null;
  created_at: string;
}

/**
 * YouTube channel information
 */
export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Recently sent message for echo detection
 */
export interface RecentlySentMessage {
  username: string;
  content: string;
  timestamp: number;
}
