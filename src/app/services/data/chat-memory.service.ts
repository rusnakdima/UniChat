import { Injectable, inject } from "@angular/core";

import { ChatMessage } from "@models/chat.model";
import { ChatPruningService } from "@services/data/chat-pruning.service";

@Injectable({
  providedIn: "root",
})
export class ChatMemoryService {
  private readonly pruning = inject(ChatPruningService);

  private channelMessagesSignal: () => Record<string, ChatMessage[]>;
  private setChannelMessagesSignal: (store: Record<string, ChatMessage[]>) => void;
  private flushPendingBatchesNow: () => void;

  constructor() {
    this.channelMessagesSignal = () => ({});
    this.setChannelMessagesSignal = () => {};
    this.flushPendingBatchesNow = () => {};
  }

  setSignals(
    getSignal: () => Record<string, ChatMessage[]>,
    setSignal: (store: Record<string, ChatMessage[]>) => void,
    flushFn: () => void
  ): void {
    this.channelMessagesSignal = getSignal;
    this.setChannelMessagesSignal = setSignal;
    this.flushPendingBatchesNow = flushFn;
  }

  enforceGlobalCap(): void {
    const store = this.channelMessagesSignal();
    const pruned = this.pruning.pruneOldMessages(store);
    if (pruned !== store) {
      this.setChannelMessagesSignal(pruned);
    }
  }

  pruneOldMessages(): void {
    this.flushPendingBatchesNow();
    this.enforceGlobalCap();
  }

  getMemoryStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    const store = this.channelMessagesSignal();
    return this.pruning.getMemoryStats(store);
  }
}
