import { Injectable, inject } from "@angular/core";
import { ChatMessage, PlatformType } from "@models/chat.model";
import {
  getPlatformBadgeClasses,
  getPlatformBadgeClassesMixedFilter,
  getPlatformLabel,
} from "@helpers/chat.helper";
import { HighlightRulesService } from "@services/ui/highlight-rules.service";

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
      twitch:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239146FF'%3E%3Cpath d='M2.149 0l-1.612 3.76v16.482h4.841v3.76h3.227l3.227-3.76h4.303l7.53-7.53V0H2.149zm18.82 12.967l-3.227 3.227h-4.303l-2.689 3.227v-3.227H6.453V2.149h14.516v10.818zm-3.764-6.453h-2.149v6.453h2.149V6.514zm-5.915 0H9.136v6.453h2.149V6.514z'/%3E%3C/svg%3E",
      kick: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2353FC18'%3E%3Cpath d='M4.5 3.75L3 24h4.5l1.5-12 3 12h4.5l4.5-20.25h-4.5l-3 13.5-3-13.5H4.5z'/%3E%3C/svg%3E",
      youtube:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FF0000'%3E%3Cpath d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'/%3E%3C/svg%3E",
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
