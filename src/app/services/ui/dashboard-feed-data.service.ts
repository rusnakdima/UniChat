import { Injectable, signal } from '@angular/core';

export interface DashboardFeedDataService {
  feedItems: unknown[];
  mixedFeedChronological: boolean;
  mixedScrollToken: string;
  platformFilter: string[];
}

@Injectable({ providedIn: 'root' })
export class DashboardFeedDataService {
  private _items = signal<unknown[]>([]);
  private _chronological = signal(false);
  private _scrollToken = signal('');
  private _platforms = signal<string[]>([]);

  getFeedItems(): unknown[] { return this._items(); }
  refreshFeed(): void {}
  get platformsWithVisibleChannels(): string[] { return this._platforms(); }
  get mixedFeedChronological(): boolean { return this._chronological(); }
  get mixedScrollToken(): string { return this._scrollToken(); }
  get platformFilter(): string[] { return this._platforms(); }
  setPlatformFilter(platforms: string[]): void { this._platforms.set(platforms); }
}
