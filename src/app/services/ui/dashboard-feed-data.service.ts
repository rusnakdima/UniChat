import { Injectable, signal, computed, Signal } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

export interface DashboardFeedDataService {
  readonly feedItems: Signal<ChatMessage[]>;
  readonly mixedFeedChronological: Signal<ChatMessage[]>;
  readonly mixedScrollToken: Signal<string>;
  readonly platformFilter: Signal<string>;
  readonly platformsWithVisibleChannels: Signal<string[]>;
}

@Injectable({ providedIn: "root" })
export class DashboardFeedDataService {
  private _items = signal<ChatMessage[]>([]);
  private _chronological = signal<ChatMessage[]>([]);
  private _scrollToken = signal("");
  private _platforms = signal<string[]>([]);

  readonly feedItems: Signal<ChatMessage[]> = this._items.asReadonly();
  readonly mixedFeedChronological: Signal<ChatMessage[]> = this._chronological.asReadonly();
  readonly mixedScrollToken: Signal<string> = this._scrollToken.asReadonly();
  readonly platformFilter: Signal<string> = computed(() => this._platforms()[0] || "all");
  readonly platformsWithVisibleChannels: Signal<string[]> = this._platforms.asReadonly();

  getFeedItems(): unknown[] {
    return this._items();
  }
  refreshFeed(): void {}
  setPlatformFilter(platform: string): void {
    if (platform === "all") {
      this._platforms.set([]);
    } else {
      this._platforms.set([platform]);
    }
  }
}
