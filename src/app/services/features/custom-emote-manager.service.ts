import { Injectable } from '@angular/core';

export interface CustomEmote {
  id: string;
  code: string;
  imageUrl: string;
}

export interface EmoteCategory {
  id: string;
  name: string;
  emotes: CustomEmote[];
}

@Injectable({ providedIn: 'root' })
export class CustomEmoteManagerService {
  private _emotes = new Map<string, CustomEmote>();
  private _categories = new Map<string, EmoteCategory>();

  get emotes(): CustomEmote[] { return Array.from(this._emotes.values()); }
  get categories(): EmoteCategory[] { return Array.from(this._categories.values()); }

  getEmotes(): CustomEmote[] { return this.emotes; }
  getEmotesForMessageRendering(): Map<string, CustomEmote> { return this._emotes; }
  getRecentEmotes(): CustomEmote[] { return []; }
  searchEmotes(query: string): CustomEmote[] { return []; }

  addEmote(emote: CustomEmote): void { this._emotes.set(emote.id, emote); }
  removeEmote(emoteId: string): void { this._emotes.delete(emoteId); }
}
