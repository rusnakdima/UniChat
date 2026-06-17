/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatMessage, MessageType } from "@models/chat.model";
import { buildChannelRef } from "@utils/channel-ref.util";
/**
 * Detects message types based on user activity patterns
 * - "first_message": User's first message ever to this channel
 * - "returning": User hasn't sent a message in a while (5+ minutes)
 * - "highlighted": Special messages (moderator, VIP, broadcaster, announcement)
 * - "regular": Standard message from active user
 */
@Injectable({
  providedIn: "root",
})
export class MessageTypeDetectorService {
  /** Track last message timestamp per user per channel */
  private userLastMessage = new Map<string, string>();

  /** Track users who have messaged in channels (for first message detection) */
  private userHasMessaged = new Set<string>();

  /** Time threshold for "returning" user detection (5 minutes) */
  private readonly RETURNING_THRESHOLD_MS = 5 * 60 * 1000;

  /** Maximum number of user-channel pairs to track before eviction */
  private readonly MAX_USER_TRACKING = 10000;

  /** Number of entries to evict when limit is reached (20%) */
  private readonly EVICTION_BATCH_SIZE = Math.floor(this.MAX_USER_TRACKING * 0.2);

  /**
   * Evict oldest entries if the Map exceeds the maximum size
   */
  private evictIfNeeded(): void {
    if (this.userLastMessage.size >= this.MAX_USER_TRACKING) {
      // Remove oldest entries (first 20%)
      const keysToRemove = Array.from(this.userLastMessage.keys()).slice(
        0,
        this.EVICTION_BATCH_SIZE
      );
      keysToRemove.forEach((key) => this.userLastMessage.delete(key));
    }
  }

  /**
   * Detect message type for a new message
   * Should be called before adding message to storage
   */
  detectMessageType(message: ChatMessage): { type: MessageType; reason?: string } {
    const cacheKey = this.getCacheKey(
      message.sourceUserId,
      buildChannelRef(message.platform, message.sourceChannelId)
    );
    const now = new Date(message.timestamp).getTime();

    // Check if this is a highlighted/special message based on badges or events
    if (this.isHighlightedMessage(message)) {
      return { type: "highlighted", reason: "Special event or badge" };
    }

    // Check if this is user's first message ever to this channel
    if (!this.userHasMessaged.has(cacheKey)) {
      return { type: "first_message", reason: "First message in channel" };
    }

    const lastMessageTime = this.userLastMessage.get(cacheKey);

    // Check if user is returning after being away
    if (lastMessageTime) {
      const lastSeen = new Date(lastMessageTime).getTime();
      const timeSinceLastMessage = now - lastSeen;

      if (timeSinceLastMessage > this.RETURNING_THRESHOLD_MS) {
        return { type: "returning", reason: "User returning after absence" };
      }
    }

    // Regular message from active user
    return { type: "regular" };
  }

  /**
   * Update last message timestamp for a user
   * Should be called after message is added
   */
  updateLastMessageTime(message: ChatMessage): void {
    const cacheKey = this.getCacheKey(
      message.sourceUserId,
      buildChannelRef(message.platform, message.sourceChannelId)
    );
    this.userLastMessage.set(cacheKey, message.timestamp);
    this.userHasMessaged.add(cacheKey);
    this.evictIfNeeded();
  }

  /**
   * Check if a message should be highlighted based on badges or events
   */
  private isHighlightedMessage(message: ChatMessage): boolean {
    // Only moderator/VIP badges trigger highlight (not broadcaster/founder)
    const highlightBadges = ["moderator", "vip"];
    const hasHighlightBadge = message.badges.some((badge) =>
      highlightBadges.includes(badge.toLowerCase())
    );

    if (hasHighlightBadge) {
      return true;
    }

    // Check for announcement/raid USERNOTICE messages
    const announcementMsgIds = ["subscriber", "ritual", "announcement", "raid"];
    const msgId = message.rawPayload.msgId;
    if (msgId && announcementMsgIds.includes(msgId)) {
      return true;
    }

    return false;
  }

  /**
   * Generate cache key for user-channel pair
   */
  private getCacheKey(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }

  /**
   * Clear all tracking data (e.g., on app restart)
   */
  clearAll(): void {
    this.userLastMessage.clear();
    this.userHasMessaged.clear();
  }

  /**
   * Get statistics about message types for debugging
   */
  getStats(): { totalUsers: number; returningUsers: number } {
    const returningUsers = Array.from(this.userLastMessage.entries()).length;

    return {
      totalUsers: this.userLastMessage.size,
      returningUsers: returningUsers,
    };
  }
}
