import { Injectable, signal, computed } from "@angular/core";
import { ChatMessage } from "@models/chat.model";

interface CacheEntry<T> {
  data: T;
  version: number;
}

@Injectable({
  providedIn: "root",
})
export class StorageCacheService {
  private readonly allMessagesVersionSignal = signal(0);
  readonly allMessagesCache = signal<CacheEntry<ChatMessage[]>>({ version: 0, data: [] });
  private readonly lastChannelMessages = signal<Record<string, ChatMessage[]>>({});

  readonly allMessagesVersion = this.allMessagesVersionSignal.asReadonly();

  readonly allMessages = computed(() => {
    const currentVersion = this.allMessagesVersionSignal();
    const currentChannelMessages = this.getChannelMessagesSignal();

    if (this.allMessagesCache().version === currentVersion) {
      return this.allMessagesCache().data;
    }

    const allMessages: ChatMessage[] = [];

    for (const [channelId, messages] of Object.entries(currentChannelMessages)) {
      allMessages.push(...messages);
      this.lastChannelMessages.update((prev) => ({ ...prev, [channelId]: messages }));
    }

    for (const channelId of Object.keys(this.lastChannelMessages())) {
      if (!currentChannelMessages[channelId]) {
        this.lastChannelMessages.update((prev) => {
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    }

    const sorted = [...allMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    this.allMessagesCache.set({ version: currentVersion, data: sorted });
    return sorted;
  });

  private channelMessagesSignal: () => Record<string, ChatMessage[]> = () => ({});

  setChannelMessagesSignal(fn: () => Record<string, ChatMessage[]>): void {
    this.channelMessagesSignal = fn;
  }

  private getChannelMessagesSignal(): Record<string, ChatMessage[]> {
    return this.channelMessagesSignal();
  }

  incrementMessageVersion(): void {
    this.allMessagesVersionSignal.update((v) => v + 1);
  }

  invalidateCache(): void {
    this.allMessagesCache.set({ version: -1, data: [] });
    this.lastChannelMessages.set({});
  }

  getLastChannelMessages(channelId: string): ChatMessage[] | undefined {
    return this.lastChannelMessages()[channelId];
  }
}
