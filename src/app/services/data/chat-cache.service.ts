import { computed, Injectable, signal } from "@angular/core";

import { ChatMessage } from "@models/chat.model";

@Injectable({
  providedIn: "root",
})
export class ChatCacheService {
  readonly allMessagesVersion = signal(0);

  private _allMessagesCache: { version: number; messages: ChatMessage[] } = {
    version: 0,
    messages: [],
  };

  private _lastChannelMessages: Record<string, ChatMessage[]> = {};

  readonly allMessages = computed(() => {
    const currentVersion = this.allMessagesVersion();
    const currentChannelMessages = this.channelMessagesSignal();

    if (this._allMessagesCache.version === currentVersion) {
      return this._allMessagesCache.messages;
    }

    const allMessages: ChatMessage[] = [];

    for (const [channelId, messages] of Object.entries(currentChannelMessages)) {
      allMessages.push(...messages);
      this._lastChannelMessages[channelId] = messages;
    }

    for (const channelId of Object.keys(this._lastChannelMessages)) {
      if (!currentChannelMessages[channelId]) {
        delete this._lastChannelMessages[channelId];
      }
    }

    const sorted = [...allMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    this._allMessagesCache = { version: currentVersion, messages: sorted };
    return sorted;
  });

  private channelMessagesSignal: () => Record<string, ChatMessage[]>;

  constructor() {
    this.channelMessagesSignal = () => ({});
  }

  setChannelMessagesSignal(fn: () => Record<string, ChatMessage[]>): void {
    this.channelMessagesSignal = fn;
  }

  incrementMessageVersion(): void {
    this.allMessagesVersion.update((v) => v + 1);
  }

  invalidateCache(): void {
    this._allMessagesCache = { version: -1, messages: [] };
    this._lastChannelMessages = {};
  }
}
