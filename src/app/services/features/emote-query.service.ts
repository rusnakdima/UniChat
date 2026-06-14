import { Injectable, inject } from "@angular/core";
import { PlatformType } from "@models/chat.model";
import { CustomEmote, CustomEmoteManagerService } from "./custom-emote-manager.service";

@Injectable({
  providedIn: "root",
})
export class EmoteQueryService {
  private readonly manager = inject(CustomEmoteManagerService);

  private prefixLookupCache = new Map<string, CustomEmote[]>();
  private lastRevision = -1;

  getEmotesForMessageRendering(platform: PlatformType): CustomEmote[] {
    const applicable = this.manager.emotes().filter((e) => !e.platform || e.platform === platform);
    const byLen = [...applicable].sort((a, b) => b.code.length - a.code.length);
    const seen = new Set<string>();
    const out: CustomEmote[] = [];
    for (const e of byLen) {
      if (!e.code.trim()) {
        continue;
      }
      const key = e.code.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(e);
      }
    }
    return out;
  }

  getEmotesStartingWith(prefix: string): CustomEmote[] {
    const currentRevision = this.manager.emotesRevision();
    if (currentRevision !== this.lastRevision) {
      this.prefixLookupCache.clear();
      this.lastRevision = currentRevision;
    }

    if (!prefix) {
      return this.getEmotesForMessageRendering("twitch");
    }

    const cacheKey = prefix.toLowerCase();
    if (this.prefixLookupCache.has(cacheKey)) {
      return this.prefixLookupCache.get(cacheKey)!;
    }

    const allEmotes = this.getEmotesForMessageRendering("twitch");
    const matching = allEmotes.filter((e) => e.code.toLowerCase().startsWith(cacheKey));
    const sorted = matching.sort((a, b) => b.code.length - a.code.length);

    this.prefixLookupCache.set(cacheKey, sorted);
    return sorted;
  }

  getEmoteStartChars(): Set<string> {
    const emotes = this.manager.emotes();
    const chars = new Set<string>();
    for (const e of emotes) {
      if (e.code.length > 0) {
        chars.add(e.code[0].toLowerCase());
      }
    }
    return chars;
  }

  searchEmotes(query: string): CustomEmote[] {
    const lowerQuery = query.toLowerCase();
    return this.manager.emotes()
      .filter((e) => e.code.toLowerCase().includes(lowerQuery))
      .slice(0, 50);
  }

  getRecentEmotes(limit: number = 20): CustomEmote[] {
    return [...this.manager.emotes()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  getEmoteByCode(code: string): CustomEmote | undefined {
    return this.manager.emotes().find((e) => e.code.toLowerCase() === code.toLowerCase());
  }

  getEmotesByPlatform(platform: PlatformType): CustomEmote[] {
    return this.manager.emotes().filter((e) => e.platform === platform);
  }
}
