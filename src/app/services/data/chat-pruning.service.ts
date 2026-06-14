/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* config */
import { APP_CONFIG } from "@shared/utils/constants";

/* helpers */
import { sortMessagesChronological } from "@shared/utils/chat.helper";

/**
 * Chat Pruning Service
 *
 * Responsibility: Memory management for chat messages.
 * Handles global message cap enforcement and periodic pruning.
 */
@Injectable({
  providedIn: "root",
})
export class ChatPruningService {
  /**
   * Prune old messages across all channels to prevent memory growth.
   * Trims to MAX_MESSAGES_TOTAL by removing oldest messages first.
   * Also enforces per-channel limit (MAX_MESSAGES_PER_CHANNEL).
   * Returns the pruned store.
   */
  pruneOldMessages(store: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
    const maxTotal = APP_CONFIG.MAX_MESSAGES_TOTAL;
    const maxPerChannel = APP_CONFIG.MAX_MESSAGES_PER_CHANNEL;

    let totalCount = 0;
    for (const [channelId, messages] of Object.entries(store)) {
      const trimmed = messages.length > maxPerChannel ? messages.slice(-maxPerChannel) : messages;
      if (trimmed.length !== messages.length) {
        store[channelId] = trimmed;
      }
      totalCount += trimmed.length;
    }

    if (totalCount <= maxTotal) {
      return store;
    }

    const allWithChannel: { channelId: string; msg: ChatMessage }[] = [];
    for (const [channelId, messages] of Object.entries(store)) {
      for (const msg of messages) {
        allWithChannel.push({ channelId, msg });
      }
    }

    allWithChannel.sort(
      (a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime()
    );

    const toRemove = allWithChannel.slice(0, allWithChannel.length - maxTotal);
    const toKeep = allWithChannel.slice(allWithChannel.length - maxTotal);

    const newStore: Record<string, ChatMessage[]> = {};
    for (const entry of toKeep) {
      if (!newStore[entry.channelId]) {
        newStore[entry.channelId] = [];
      }
      newStore[entry.channelId].push(entry.msg);
    }

    for (const channelId of Object.keys(newStore)) {
      newStore[channelId] = sortMessagesChronological(newStore[channelId]);
    }

    return newStore;
  }

  /**
   * Get memory usage stats
   */
  getMemoryStats(store: Record<string, ChatMessage[]>): {
    totalMessages: number;
    channels: number;
    byChannel: Record<string, number>;
  } {
    const byChannel: Record<string, number> = {};
    let total = 0;

    for (const [channelId, messages] of Object.entries(store)) {
      byChannel[channelId] = messages.length;
      total += messages.length;
    }

    return {
      totalMessages: total,
      channels: Object.keys(store).length,
      byChannel,
    };
  }
}
