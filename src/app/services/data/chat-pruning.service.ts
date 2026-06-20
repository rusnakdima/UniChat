import { Injectable } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

export interface ChatPruningStats {
  messageCount: number;
  oldestTimestamp: number;
  byPlatform?: Record<string, number>;
  totalChannels?: number;
  totalMessages?: number;
}

@Injectable({ providedIn: "root" })
export class ChatPruningService {
  prune(olderThanMs: number): number {
    return 0;
  }
  pruneOldMessages(_store: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
    return _store;
  }
  getMemoryStats(_store: Record<string, ChatMessage[]>): {
    totalMessages: number;
    channels: number;
    byChannel: Record<string, number>;
  } {
    return { totalMessages: 0, channels: 0, byChannel: {} };
  }
}
