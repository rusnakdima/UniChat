import { Injectable } from "@angular/core";
import { ChatMessage, MessageType } from "@models/chat.model";

/**
 * Detects message types based on user activity patterns
 * - "returning": User hasn't sent a message in a while (5+ minutes)
 * - "highlighted": Special messages (moderator, VIP, broadcaster, special subscriber)
 * - "regular": Standard message from active user
 */
@Injectable({
  providedIn: "root",
})
export class MessageTypeDetectorService {
  /** Track last message timestamp per user per channel */
  private userLastMessage = new Map<string, string>();

  /** Time threshold for "returning" user detection (5 minutes) */
  private readonly RETURNING_THRESHOLD_MS = 5 * 60 * 1000;

  /**
   * Detect message type for a new message
   * Should be called before adding message to storage
   */
  detectMessageType(message: ChatMessage): { type: MessageType; reason?: string } {
    const cacheKey = this.getCacheKey(message.sourceUserId, message.sourceChannelId);
    const now = new Date(message.timestamp).getTime();

    // Check if this is a highlighted/special message based on badges or events
    if (this.isHighlightedMessage(message)) {
      return { type: "highlighted", reason: "Special event or badge" };
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
    const cacheKey = this.getCacheKey(message.sourceUserId, message.sourceChannelId);
    this.userLastMessage.set(cacheKey, message.timestamp);
  }

  /**
   * Check if a message should be highlighted based on badges or events
   */
  private isHighlightedMessage(message: ChatMessage): boolean {
    // Check for special badges that indicate highlighted messages
    const highlightBadges = ["broadcaster", "moderator", "vip", "founder"];
    const hasHighlightBadge = message.badges.some((badge) =>
      highlightBadges.includes(badge.toLowerCase())
    );

    if (hasHighlightBadge) {
      return true;
    }

    // Check for supporter status with special events
    if (message.isSupporter) {
      const supporterBadges = ["subscriber", "supporter", "member"];
      const hasSupporterBadge = message.badges.some((badge) =>
        supporterBadges.includes(badge.toLowerCase())
      );
      // Subscribers with additional badges are highlighted
      if (hasSupporterBadge && message.badges.length > 1) {
        return true;
      }
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
