import { Injectable } from '@angular/core';

export interface IconDefinition {
  id: string;
  name: string;
  svg: string;
}

export interface PickableIconsEmote extends IconDefinition {
  code: string;
  isEmote: boolean;
  scope?: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class IconsCatalogService {
  private _icons = new Map<string, IconDefinition>();

  getAllIcons(): IconDefinition[] { return Array.from(this._icons.values()); }
  getIcon(id: string): IconDefinition | null { return this._icons.get(id) || null; }
  clearCache(): void { this._icons.clear(); }
  ensureChannelLoaded(channelId: string): Promise<void> { return Promise.resolve(); }
  ensureGlobalLoaded(): Promise<void> { return Promise.resolve(); }
  listPickableIconsEmotes(): PickableIconsEmote[] { return []; }
}
