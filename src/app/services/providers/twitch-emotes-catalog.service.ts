import { Injectable } from '@angular/core';

export interface TwitchChannelEmote {
  id: string;
  code: string;
  imageUrl: string;
  tier: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class TwitchEmotesCatalogService {
  private _emotes = new Map<string, TwitchChannelEmote>();

  getEmotes(): TwitchChannelEmote[] { return Array.from(this._emotes.values()); }
  getEmoteByCode(code: string): TwitchChannelEmote | null {
    for (const emote of this._emotes.values()) { if (emote.code === code) return emote; }
    return null;
  }
  fetchTwitchChannelEmotes(channelId: string): Promise<TwitchChannelEmote[]> { return Promise.resolve([]); }
}
