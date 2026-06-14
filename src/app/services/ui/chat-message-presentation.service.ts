/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage, PlatformType } from "@models/chat.model";

/* constants */
import {
  PLATFORM_TWITCH_ICON,
  PLATFORM_KICK_ICON,
  PLATFORM_YOUTUBE_ICON,
} from "@shared/utils/constants";

/* services */
import { HighlightRulesService } from "@services/ui/highlight-rules.service";

/* helpers */
import {
  getPlatformBadgeClasses,
  getPlatformBadgeClassesMixedFilter,
  getPlatformLabel,
} from "@shared/utils/chat.helper";
@Injectable({
  providedIn: "root",
})
export class ChatMessagePresentationService {
  private readonly highlightRulesService = inject(HighlightRulesService);

  readonly getPlatformBadgeClasses = getPlatformBadgeClasses;
  readonly getPlatformBadgeClassesMixedFilter = getPlatformBadgeClassesMixedFilter;

  platformLabel(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  /** Get platform icon URL (SVG data URI or external URL) */
  platformIconUrl(platform: PlatformType): string {
    const icons: Record<PlatformType, string> = {
      twitch: PLATFORM_TWITCH_ICON,
      kick: PLATFORM_KICK_ICON,
      youtube: PLATFORM_YOUTUBE_ICON,
    };
    return icons[platform];
  }

  messageTimeLabel(message: ChatMessage): string {
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  messageFullTimeLabel(message: ChatMessage): string {
    return new Date(message.timestamp).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  messageBadgeClasses(message: ChatMessage): string {
    return `${getPlatformBadgeClasses(message.platform)} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]`;
  }

  usernameColorClasses(author: string): string {
    const colors = [
      "text-red-500 dark:text-red-400",
      "text-orange-500 dark:text-orange-400",
      "text-amber-500 dark:text-amber-400",
      "text-yellow-500 dark:text-yellow-400",
      "text-lime-500 dark:text-lime-400",
      "text-green-500 dark:text-green-400",
      "text-emerald-500 dark:text-emerald-400",
      "text-teal-500 dark:text-teal-400",
      "text-cyan-500 dark:text-cyan-400",
      "text-sky-500 dark:text-sky-400",
      "text-blue-500 dark:text-blue-400",
      "text-indigo-500 dark:text-indigo-400",
      "text-violet-500 dark:text-violet-400",
      "text-purple-500 dark:text-purple-400",
      "text-fuchsia-500 dark:text-fuchsia-400",
      "text-pink-500 dark:text-pink-400",
      "text-rose-500 dark:text-rose-400",
    ];

    let hash = 0;
    for (let i = 0; i < author.length; i++) {
      hash = author.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  /**
   * Get highlight color for a message based on highlight rules
   * Returns null if no highlight matches
   */
  getHighlightColor(message: ChatMessage): string | null {
    return this.highlightRulesService.getHighlightColor(
      message.text,
      message.author,
      message.sourceChannelId
    );
  }

  /**
   * Check if a message should be highlighted
   */
  isHighlighted(message: ChatMessage): boolean {
    return this.getHighlightColor(message) !== null;
  }
}
