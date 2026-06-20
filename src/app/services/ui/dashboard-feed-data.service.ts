import { Injectable, signal, computed, Signal, inject } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { buildChannelRef } from "@utils/channel-ref.util";

@Injectable({ providedIn: "root" })
export class DashboardFeedDataService {
  private readonly prefs = inject(DashboardPreferencesService);

  private _items = signal<ChatMessage[]>([]);
  private _chronological = signal<ChatMessage[]>([]);
  private _scrollToken = signal("");
  private _platforms = signal<string[]>([]);

  readonly rawFeedItems: Signal<ChatMessage[]> = this._items.asReadonly();

  readonly feedItems: Signal<ChatMessage[]> = computed(() => {
    const all = this._items();
    const enabled = this.prefs.preferences().mixedEnabledChannelIds;
    if (enabled.size === 0) return all;

    return all.filter((msg) => {
      const ref = buildChannelRef(msg.platform, msg.sourceChannelId);
      const refLower = ref.toLowerCase();
      for (const e of enabled) {
        if (e.toLowerCase() === refLower) return true;
      }
      return false;
    });
  });

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

  addMessage(message: ChatMessage): void {
    console.log(`[FeedData] addMessage called:`, {
      id: message.id,
      platform: message.platform,
      sourceChannelId: message.sourceChannelId,
      author: message.author,
      text: message.text.substring(0, 50),
    });
    this._items.update((items) => {
      const maxItems = 1000;
      const updated = [...items, message];
      console.log(`[FeedData] _items now has ${updated.length} messages`);
      if (updated.length > maxItems) {
        return updated.slice(-maxItems);
      }
      return updated;
    });
    const enabled = this.prefs.preferences().mixedEnabledChannelIds;
    const ref = buildChannelRef(message.platform, message.sourceChannelId);
    console.log(
      `[FeedData] Checking if ${ref} (lower: ${ref.toLowerCase()}) is in enabled:`,
      Array.from(enabled).map((e) => e.toLowerCase()),
      "result:",
      enabled.has(ref) || Array.from(enabled).some((e) => e.toLowerCase() === ref.toLowerCase())
    );
  }
}
