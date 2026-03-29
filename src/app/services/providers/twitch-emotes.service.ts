/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatBadgeIcon, ChatMessageEmote } from "@models/chat.model";

/* services */
import { EmoteUrlService } from "@services/ui/emote-url.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";
/**
 * Twitch Emotes Service - Emote Parsing and Resolution
 *
 * Responsibility: Handles Twitch emote parsing, URL resolution, and caching.
 * Supports Twitch native emotes, 7TV, BTTV, and FFZ.
 *
 * This is a focused service extracted from TwitchChatService to improve:
 * - Testability (can test emote parsing independently)
 * - Maintainability (emote logic isolated from IRC logic)
 * - Reusability (emote parsing could be shared across platforms)
 */
@Injectable({
  providedIn: "root",
})
export class TwitchEmotesService {
  private readonly emoteUrlService = inject(EmoteUrlService);
  private readonly iconsCatalog = inject(IconsCatalogService);

  /**
   * Emotes for a live Twitch IRC message: native emote ranges plus non-overlapping 7TV tokens.
   */
  extractEmotesForTwitchMessage(
    messageText: string,
    emotesById: { [emoteId: string]: string[] } | undefined,
    roomId: string | undefined
  ): ChatMessageEmote[] {
    const result: ChatMessageEmote[] = [];

    const twitchEmotes = emotesById ?? {};
    for (const [emoteId, ranges] of Object.entries(twitchEmotes)) {
      if (!/^\d+$/.test(String(emoteId))) {
        continue;
      }
      for (const range of ranges) {
        const [startRaw, endRaw] = range.split("-");
        const start = Number(startRaw);
        const end = Number(endRaw);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
          continue;
        }
        const code = messageText.slice(start, end + 1);
        result.push({
          provider: "twitch",
          id: emoteId,
          code,
          start,
          end,
          url: this.emoteUrlService.getTwitchEmote(emoteId),
        });
      }
    }

    const tokenRegex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(messageText))) {
      const code = match[0];
      const start = match.index;
      const end = start + code.length - 1;
      const overlaps = result.some((emote) => !(end < emote.start || start > emote.end));
      if (overlaps) {
        continue;
      }

      const seven = this.iconsCatalog.resolveSevenTvEmote(roomId, code);
      if (!seven) {
        continue;
      }
      result.push({
        provider: "7tv",
        id: seven.id,
        code,
        start,
        end,
        url: seven.url,
      });
    }

    return result.sort((left, right) => left.start - right.start);
  }

  extractBadgeIconsForTwitchMessage(
    badges: Record<string, string | undefined> | undefined,
    roomId: string | undefined
  ): ChatBadgeIcon[] {
    const badgeEntries = badges ?? {};
    const icons: ChatBadgeIcon[] = [];

    for (const [badgeKey, badgeVersion] of Object.entries(badgeEntries)) {
      if (!badgeVersion) {
        continue;
      }
      const resolved = this.iconsCatalog.resolveTwitchBadgeIcon(roomId, badgeKey, badgeVersion);
      if (resolved) {
        icons.push({
          id: resolved.id,
          label: resolved.label,
          url: resolved.url,
        });
      }
    }

    return icons;
  }

  /**
   * Parse emotes from Twitch IRC tags
   */
  parseEmotesFromTags(emotesTag: string | undefined, message: string): ChatMessageEmote[] {
    if (!emotesTag) {
      return [];
    }

    const emotes: ChatMessageEmote[] = [];
    const emoteList = emotesTag.split("/");

    for (const emote of emoteList) {
      const [id, positions] = emote.split(":");
      if (!positions) {
        continue;
      }

      const positionList = positions.split(",");
      for (const position of positionList) {
        const [start, end] = position.split("-").map(Number);
        const code = message.slice(start, end + 1);

        emotes.push({
          provider: "twitch",
          id,
          code,
          start,
          end,
          url: this.getEmoteUrl(id),
        });
      }
    }

    return emotes;
  }

  /**
   * Get emote URL with proper sizing
   */
  getEmoteUrl(emoteId: string, size: "1.0" | "2.0" | "3.0" = "1.0"): string {
    return this.emoteUrlService.getTwitchEmote(emoteId, size, "dark");
  }

  /**
   * Merge emotes from multiple sources (bracket notation + API)
   */
  mergeEmotes(
    bracketEmotes: ChatMessageEmote[],
    apiEmotes: ChatMessageEmote[]
  ): ChatMessageEmote[] {
    const emoteMap = new Map<string, ChatMessageEmote>();

    // Add bracket emotes first
    for (const emote of bracketEmotes) {
      emoteMap.set(emote.id, emote);
    }

    // Add API emotes (may override bracket emotes with better data)
    for (const emote of apiEmotes) {
      emoteMap.set(emote.id, emote);
    }

    return Array.from(emoteMap.values());
  }

  /**
   * Extract emotes from bracket notation (e.g., [emote:123:name])
   */
  extractBracketEmotes(content: string, getEmoteUrl: (id: string) => string): ChatMessageEmote[] {
    const emotes: ChatMessageEmote[] = [];
    const emoteRegex = /\[emote:(\d+):([^\]]*)\]/g;
    let match;

    while ((match = emoteRegex.exec(content)) !== null) {
      const [, id, code] = match;
      const start = match.index;
      const end = start + match[0].length - 1;

      emotes.push({
        provider: "twitch",
        id,
        code: code || `Emote ${id}`,
        start,
        end,
        url: getEmoteUrl(id),
      });
    }

    return emotes;
  }

  /**
   * Parse emotes from Twitch API response
   */
  parseEmotesFromApi(
    content: string,
    emotes: Array<{ id: string; name: string }> | undefined
  ): ChatMessageEmote[] {
    if (!emotes || emotes.length === 0) {
      return [];
    }

    const parsedEmotes: ChatMessageEmote[] = [];

    for (const emote of emotes) {
      const index = content.indexOf(emote.name);
      if (index === -1) {
        continue;
      }

      parsedEmotes.push({
        provider: "twitch",
        id: emote.id,
        code: emote.name,
        start: index,
        end: index + emote.name.length - 1,
        url: this.getEmoteUrl(emote.id),
      });
    }

    return parsedEmotes;
  }

  /**
   * Calculate emote display range for message rendering
   */
  getEmoteRanges(emotes: ChatMessageEmote[]): Array<{ start: number; end: number; url: string }> {
    return emotes.map((emote) => ({
      start: emote.start,
      end: emote.end,
      url: emote.url,
    }));
  }
}
