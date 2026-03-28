/* models */
import { ChatMessage, MessageType } from "@models/chat.model";
/**
 * Time threshold for "returning" user detection (5 minutes)
 */
const RETURNING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Badges that indicate a highlighted message
 */
const HIGHLIGHT_BADGES = ["broadcaster", "moderator", "vip", "founder"];

/**
 * Supporter badge types
 */
const SUPPORTER_BADGES = ["subscriber", "supporter", "member"];

/**
 * Pure utility function to detect message type based on user activity patterns
 * - "returning": User hasn't sent a message in a while (5+ minutes)
 * - "highlighted": Special messages (moderator, VIP, broadcaster, special subscriber)
 * - "regular": Standard message from active user
 *
 * @param message - The chat message to analyze
 * @param lastMessageTime - Optional timestamp of user's last message
 * @returns Message type and reason
 */
export function detectMessageType(
  message: ChatMessage,
  lastMessageTime?: string
): { type: MessageType; reason?: string } {
  const now = new Date(message.timestamp).getTime();

  // Check if this is a highlighted/special message based on badges or events
  if (isHighlightedMessage(message)) {
    return { type: "highlighted", reason: "Special event or badge" };
  }

  // Check if user is returning after being away
  if (lastMessageTime) {
    const lastSeen = new Date(lastMessageTime).getTime();
    const timeSinceLastMessage = now - lastSeen;

    if (timeSinceLastMessage > RETURNING_THRESHOLD_MS) {
      return { type: "returning", reason: "User returning after absence" };
    }
  }

  // Regular message from active user
  return { type: "regular" };
}

/**
 * Check if a message should be highlighted based on badges or events
 */
function isHighlightedMessage(message: ChatMessage): boolean {
  // Check for special badges that indicate highlighted messages
  const hasHighlightBadge = message.badges.some((badge) =>
    HIGHLIGHT_BADGES.includes(badge.toLowerCase())
  );

  if (hasHighlightBadge) {
    return true;
  }

  // Check for supporter status with special events
  if (message.isSupporter) {
    const hasSupporterBadge = message.badges.some((badge) =>
      SUPPORTER_BADGES.includes(badge.toLowerCase())
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
export function getUserChannelKey(userId: string, channelId: string): string {
  return `${userId}:${channelId}`;
}
