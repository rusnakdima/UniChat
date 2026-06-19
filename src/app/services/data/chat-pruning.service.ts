import { Injectable } from "@angular/core";

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
  pruneOldMessages(): number {
    return 0;
  }
  getMemoryStats(): ChatPruningStats {
    return { messageCount: 0, oldestTimestamp: 0 };
  }
}
