import { computed, Injectable, signal } from "@angular/core";

import { ChatMessage } from "@models/chat.model";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { StorageCacheService } from "@core/services/storage-cache.service";
import { inject } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class ChatCacheService {
  private readonly unified = inject(UnifiedStorageService);
  private readonly cache = inject(StorageCacheService);

  readonly allMessagesVersion = this.cache.allMessagesVersion;

  readonly allMessages = computed(() => {
    return this.unified.allMessages();
  });

  setChannelMessagesSignal(fn: () => Record<string, ChatMessage[]>): void {
    this.cache.setChannelMessagesSignal(fn);
  }

  incrementMessageVersion(): void {
    this.cache.incrementMessageVersion();
  }

  invalidateCache(): void {
    this.cache.invalidateCache();
  }
}
