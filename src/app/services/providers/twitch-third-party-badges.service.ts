/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatBadgeIcon } from "@models/chat.model";

/**
 * Fetches third-party emote inventories (7TV, BTTV, FFZ) for Twitch users — used for profile/UI enrichment.
 */
@Injectable({
  providedIn: "root",
})
export class TwitchThirdPartyBadgesService {
  /**
   * Fetch 7TV badges/emotes for a Twitch user (public API, no auth required)
   */
  async fetch7TVBadges(twitchUserId: string): Promise<ChatBadgeIcon[]> {
    try {
      const url = `https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchUserId)}`;
      const res = await fetch(url);

      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as {
        emote_sets?: Array<{
          emotes?: Array<{
            id?: string;
            name?: string;
            data?: {
              common_names?: string[];
              image_urls?: string[];
            };
          }>;
        }>;
      };

      const badges: ChatBadgeIcon[] = [];
      const emoteSets = data.emote_sets ?? [];

      for (const set of emoteSets) {
        const emotes = set.emotes ?? [];
        for (const emote of emotes) {
          const id = emote.id ?? "";
          const name = emote.name ?? emote.data?.common_names?.[0] ?? "";
          const imageUrl = emote.data?.image_urls?.[0] ?? "";

          if (id && imageUrl) {
            badges.push({
              id: `7tv-${id}`,
              label: name,
              url: imageUrl,
            });
          }
        }
      }

      return badges;
    } catch {
      return [];
    }
  }

  /**
   * Fetch BetterTTV badges/emotes for a Twitch user (public API, no auth required)
   */
  async fetchBTTVBadges(twitchUserId: string): Promise<ChatBadgeIcon[]> {
    try {
      const url = `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchUserId)}`;
      const res = await fetch(url);

      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as {
        sharedEmotes?: Array<{
          id?: string;
          code?: string;
          imageType?: string;
        }>;
        personalEmotes?: Array<{
          id?: string;
          code?: string;
          imageType?: string;
        }>;
      };

      const badges: ChatBadgeIcon[] = [];
      const emotes = [...(data.sharedEmotes ?? []), ...(data.personalEmotes ?? [])];

      for (const emote of emotes) {
        const id = emote.id ?? "";
        const code = emote.code ?? "";
        const imageType = emote.imageType ?? "png";

        if (id && code) {
          badges.push({
            id: `bttv-${id}`,
            label: code,
            url: `https://cdn.betterttv.net/emote/${id}/1x.${imageType}`,
          });
        }
      }

      return badges;
    } catch {
      return [];
    }
  }

  /**
   * Fetch FrankerFaceZ badges/emotes for a Twitch user (public API, no auth required)
   */
  async fetchFFZBadges(username: string): Promise<ChatBadgeIcon[]> {
    try {
      const url = `https://api.frankerfacez.com/v1/id/${encodeURIComponent(username)}`;
      const res = await fetch(url);

      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as {
        sets?: Record<
          string,
          {
            emoticons?: Array<{
              id?: number;
              name?: string;
              urls?: Record<string, string>;
            }>;
          }
        >;
      };

      const badges: ChatBadgeIcon[] = [];
      const sets = data.sets ?? {};

      for (const setKey of Object.keys(sets)) {
        const set = sets[setKey];
        const emoticons = set?.emoticons ?? [];

        for (const emote of emoticons) {
          const id = emote.id ?? 0;
          const name = emote.name ?? "";
          const imageUrl = emote.urls?.["1"] ?? emote.urls?.["2"] ?? emote.urls?.["4"] ?? "";

          if (id && name && imageUrl) {
            badges.push({
              id: `ffz-${id}`,
              label: name,
              url: imageUrl,
            });
          }
        }
      }

      return badges;
    } catch {
      return [];
    }
  }
}
