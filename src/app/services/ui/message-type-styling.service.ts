import { Injectable } from "@angular/core";
import { MessageType } from "@models/chat.model";

/**
 * Provides styling configuration for different message types
 */
@Injectable({
  providedIn: "root",
})
export class MessageTypeStylingService {
  /**
   * Get CSS classes for message type
   */
  getMessageTypeClasses(messageType: MessageType): string {
    switch (messageType) {
      case "returning":
        return "message-type-returning";
      case "highlighted":
        return "message-type-highlighted";
      case "regular":
      default:
        return "";
    }
  }

  /**
   * Get badge label for message type
   */
  getMessageTypeBadgeLabel(messageType: MessageType, reason?: string): string | null {
    switch (messageType) {
      case "returning":
        return "👋 Welcome Back";
      case "highlighted":
        return reason ?? "⭐ Highlighted";
      case "regular":
      default:
        return null;
    }
  }

  /**
   * Get badge icon for message type
   */
  getMessageTypeBadgeIcon(messageType: MessageType): string | null {
    switch (messageType) {
      case "returning":
        return "waving_hand";
      case "highlighted":
        return "star";
      case "regular":
      default:
        return null;
    }
  }

  /**
   * Check if message type should have animation
   */
  shouldAnimate(messageType: MessageType): boolean {
    return messageType === "highlighted";
  }

  /**
   * Get animation class for message type
   */
  getAnimationClass(messageType: MessageType): string {
    if (!this.shouldAnimate(messageType)) {
      return "";
    }

    switch (messageType) {
      case "highlighted":
        return "message-highlighted-pulse";
      default:
        return "";
    }
  }

  /**
   * Get tooltip text for message type
   */
  getMessageTypeTooltip(messageType: MessageType, reason?: string): string | null {
    switch (messageType) {
      case "returning":
        return "This user is returning after some time";
      case "highlighted":
        return reason ?? "This is a highlighted message from a VIP user";
      case "regular":
      default:
        return null;
    }
  }

  /**
   * Get all styling configuration for a message type
   */
  getMessageTypeConfig(
    messageType: MessageType,
    reason?: string
  ): {
    cssClass: string;
    badgeLabel: string | null;
    badgeIcon: string | null;
    animationClass: string;
    tooltip: string | null;
    shouldAnimate: boolean;
  } {
    return {
      cssClass: this.getMessageTypeClasses(messageType),
      badgeLabel: this.getMessageTypeBadgeLabel(messageType, reason),
      badgeIcon: this.getMessageTypeBadgeIcon(messageType),
      animationClass: this.getAnimationClass(messageType),
      tooltip: this.getMessageTypeTooltip(messageType, reason),
      shouldAnimate: this.shouldAnimate(messageType),
    };
  }
}
