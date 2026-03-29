/* sys lib */
import { computed, inject, Injectable, signal } from "@angular/core";

/* models */
import { ChatMessage, PlatformType, ChatHistoryLoadState, MessageType } from "@models/chat.model";

/* services */
import { BlockedWordsService } from "@services/ui/blocked-words.service";
import { MessageTypeDetectorService } from "@services/ui/message-type-detector.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";

/* helpers */
import { sortMessagesByRecency, groupByPlatform } from "@helpers/chat.helper";

/* config */
import { APP_CONFIG } from "@config/app.constants";
import { buildChannelRef } from "@utils/channel-ref.util";
const channelMessagesStorageKey = "unichat.channelMessages.v1";

/**
 * Chat Storage Service - PRIMARY SOURCE OF TRUTH
 *
 * Responsibility: Owns all chat message data and persistence.
 * This is THE authoritative source for chat messages in the application.
 *
 * Source of Truth Hierarchy:
 * 1. ChatStorageService - Primary message storage (owns the data) <-- THIS SERVICE
 * 2. ChatStateService - Computed state (derived from storage)
 * 3. ChatStateManagerService - Connection tracking (session state)
 * 4. ConnectionStateService - Connection status per channel
 *
 * Key Features:
 * - Signal-based reactive state management
 * - LocalStorage persistence
 * - Message deduplication and limiting
 * - History load state tracking
 * - Overlay message broadcasting
 * - High-throughput coalescing: live `addMessage` is flushed once per animation frame
 *   to cut signal churn during 1000+ msg/min bursts (memory + CPU).
 *
 * All other services should read from this service, not duplicate its data.
 *
 * @see ChatStateService for computed message views
 * @see ChatStateManagerService for session connection tracking
 * @see ConnectionStateService for connection status
 */
@Injectable({
  providedIn: "root",
})
export class ChatStorageService {
  private readonly channelMessagesSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly loadedChannels = signal<Set<string>>(new Set());
  private readonly historyLoadState = signal<Record<string, ChatHistoryLoadState>>({});
  private readonly overlayBridge = inject(OverlaySourceBridgeService);
  private readonly messageTypeDetector = inject(MessageTypeDetectorService);
  private readonly blockedWordsService = inject(BlockedWordsService);

  /** Live ingress batches (flushed on requestAnimationFrame). */
  private readonly pendingBatches = new Map<string, ChatMessage[]>();
  private batchRafId: number | null = null;

  readonly channelMessages = this.channelMessagesSignal.asReadonly();
  readonly loadedChannelsSet = this.loadedChannels.asReadonly();
  readonly historyLoadStates = this.historyLoadState.asReadonly();

  constructor() {
    // Don't load persisted messages on startup - start fresh each session
    // Messages are only from current live chat session
    // this.channelMessagesSignal.set(this.loadPersistedChannelMessages());
    this.channelMessagesSignal.set({});
  }

  readonly allMessages = computed(() => {
    const allMessages: ChatMessage[] = [];
    const messagesByChannel = this.channelMessagesSignal();

    for (const messages of Object.values(messagesByChannel)) {
      allMessages.push(...messages);
    }

    return sortMessagesByRecency(allMessages);
  });

  readonly messagesByPlatform = computed(() => {
    const allMessages = this.allMessages();
    return groupByPlatform(allMessages);
  });

  getChannelRefForMessage(message: Pick<ChatMessage, "platform" | "sourceChannelId">): string {
    return buildChannelRef(message.platform, message.sourceChannelId);
  }

  isChannelLoaded(channelId: string): boolean {
    return this.loadedChannels().has(channelId);
  }

  markChannelAsLoaded(channelId: string): void {
    this.loadedChannels.update((set) => {
      const newSet = new Set(set);
      newSet.add(channelId);
      return newSet;
    });
  }

  getHistoryLoadState(channelId: string): ChatHistoryLoadState {
    return this.historyLoadState()[channelId] ?? { loaded: false, hasMore: true };
  }

  setHistoryLoadState(channelId: string, state: ChatHistoryLoadState): void {
    this.historyLoadState.update((store) => ({
      ...store,
      [channelId]: state,
    }));
  }

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.channelMessagesSignal()[channelId] ?? [];
  }

  getMessagesByPlatform(platform: PlatformType): ChatMessage[] {
    return this.messagesByPlatform()[platform];
  }

  addMessage(channelId: string, message: ChatMessage): void {
    const { filtered, wasFiltered } = this.blockedWordsService.filterMessage(
      message.text,
      channelId
    );
    if (wasFiltered) {
      message.text = filtered;
    }

    const { type, reason } = this.messageTypeDetector.detectMessageType(message);
    message.messageType = type;
    message.messageTypeReason = reason;

    const q = this.pendingBatches.get(channelId);
    if (q) {
      q.push(message);
    } else {
      this.pendingBatches.set(channelId, [message]);
    }
    this.messageTypeDetector.updateLastMessageTime(message);
    this.scheduleBatchFlush();
  }

  addMessages(channelId: string, messages: ChatMessage[]): void {
    this.flushPendingBatchesNow();

    // Sort messages chronologically (oldest first) for correct type detection
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply blocked words filtering and detect message types
    for (const message of sortedMessages) {
      const { filtered, wasFiltered } = this.blockedWordsService.filterMessage(
        message.text,
        channelId
      );
      if (wasFiltered) {
        message.text = filtered;
      }
      const { type, reason } = this.messageTypeDetector.detectMessageType(message);
      message.messageType = type;
      message.messageTypeReason = reason;
    }

    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId] ?? [];
      const messageMap = new Map(channelMessages.map((msg) => [msg.id, msg]));

      for (const message of messages) {
        messageMap.set(message.id, message);
      }

      return {
        ...store,
        [channelId]: this.limitMessages(sortMessagesByRecency(Array.from(messageMap.values()))),
      };
    });
    this.persistChannelMessages();

    // Update last message times after adding (in chronological order)
    for (const message of sortedMessages) {
      this.messageTypeDetector.updateLastMessageTime(message);
    }

    // Forward messages in original order for display
    for (const message of messages) {
      this.overlayBridge.forwardMessage(message);
    }
  }

  prependMessages(channelId: string, messages: ChatMessage[]): void {
    this.flushPendingBatchesNow();

    // Sort messages chronologically (oldest first) for correct type detection
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply blocked words filtering and detect message types
    for (const message of sortedMessages) {
      const { filtered, wasFiltered } = this.blockedWordsService.filterMessage(
        message.text,
        channelId
      );
      if (wasFiltered) {
        message.text = filtered;
      }
      const { type, reason } = this.messageTypeDetector.detectMessageType(message);
      message.messageType = type;
      message.messageTypeReason = reason;
    }

    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId] ?? [];
      const messageMap = new Map(channelMessages.map((msg) => [msg.id, msg]));

      for (const message of messages) {
        messageMap.set(message.id, message);
      }

      const sortedMessages = sortMessagesByRecency(Array.from(messageMap.values()));
      return {
        ...store,
        [channelId]: this.limitMessages(sortedMessages),
      };
    });
    this.persistChannelMessages();

    // Update last message times after adding (in chronological order)
    for (const message of sortedMessages) {
      this.messageTypeDetector.updateLastMessageTime(message);
    }

    // Forward messages in original order for display
    for (const message of messages) {
      this.overlayBridge.forwardMessage(message);
    }
  }

  removeMessage(channelId: string, messageId: string): void {
    this.flushPendingBatchesNow();
    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId];

      if (!channelMessages) {
        return store;
      }

      return {
        ...store,
        [channelId]: channelMessages.filter((msg) => msg.id !== messageId),
      };
    });
    this.persistChannelMessages();
  }

  updateMessage(channelId: string, messageId: string, updates: Partial<ChatMessage>): void {
    this.flushPendingBatchesNow();
    const channelMessages = this.channelMessagesSignal()[channelId];
    if (!channelMessages) {
      return;
    }

    const existing = channelMessages.find((m) => m.id === messageId);
    if (!existing) {
      return;
    }

    const shouldForward =
      updates.text !== undefined ||
      updates.timestamp !== undefined ||
      updates.author !== undefined ||
      updates.platform !== undefined ||
      updates.isSupporter !== undefined ||
      updates.isDeleted !== undefined ||
      updates.canRenderInOverlay !== undefined;

    const updated: ChatMessage = { ...existing, ...updates };

    this.channelMessagesSignal.update((store) => {
      const messages = store[channelId];
      if (!messages) {
        return store;
      }

      return {
        ...store,
        [channelId]: messages.map((msg) => (msg.id === messageId ? updated : msg)),
      };
    });
    this.persistChannelMessages();

    if (shouldForward) {
      this.overlayBridge.forwardMessage(updated);
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchRafId !== null) {
      return;
    }
    this.batchRafId = requestAnimationFrame(() => {
      this.batchRafId = null;
      this.flushBatches();
    });
  }

  /** Apply pending live messages (one signal update per frame per burst). */
  private flushBatches(): void {
    if (this.pendingBatches.size === 0) {
      return;
    }
    const snapshot = new Map(this.pendingBatches);
    this.pendingBatches.clear();

    this.channelMessagesSignal.update((store) => {
      let next: Record<string, ChatMessage[]> = { ...store };
      for (const [channelId, incoming] of snapshot) {
        if (incoming.length === 0) {
          continue;
        }
        const channelMessages = next[channelId] ?? [];
        const messageMap = new Map(channelMessages.map((msg) => [msg.id, msg]));
        for (const message of incoming) {
          messageMap.set(message.id, message);
        }
        next = {
          ...next,
          [channelId]: this.limitMessages(sortMessagesByRecency(Array.from(messageMap.values()))),
        };
      }
      return next;
    });
    this.persistChannelMessages();

    for (const incoming of snapshot.values()) {
      for (const message of incoming) {
        this.overlayBridge.forwardMessage(message);
      }
    }
  }

  private flushPendingBatchesNow(): void {
    if (this.batchRafId !== null) {
      cancelAnimationFrame(this.batchRafId);
      this.batchRafId = null;
    }
    this.flushBatches();
  }

  private persistChannelMessages(): void {
    // Disabled: Don't persist messages to localStorage
    // Messages are session-only and cleared on app restart
    // try {
    //   localStorage.setItem(channelMessagesStorageKey, JSON.stringify(this.channelMessagesSignal()));
    // } catch {
    //   // Ignore storage quota/runtime errors; keep in-memory behavior.
    // }
  }

  private loadPersistedChannelMessages(): Record<string, ChatMessage[]> {
    try {
      const raw = localStorage.getItem(channelMessagesStorageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      const out: Record<string, ChatMessage[]> = {};
      for (const [channelId, rows] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(rows)) {
          continue;
        }
        const safeRows = rows.filter(
          (row) => row !== null && typeof row === "object"
        ) as ChatMessage[];
        out[channelId] = this.limitMessages(sortMessagesByRecency(safeRows));
      }
      return out;
    } catch {
      return {};
    }
  }

  private limitMessages(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= APP_CONFIG.MAX_MESSAGES_PER_CHANNEL) {
      return messages;
    }
    return messages.slice(0, APP_CONFIG.MAX_MESSAGES_PER_CHANNEL);
  }

  /**
   * Prune old messages across all channels to prevent memory growth
   * Called periodically to maintain healthy memory usage
   */
  pruneOldMessages(): void {
    this.flushPendingBatchesNow();
    const now = Date.now();
    const maxAge = APP_CONFIG.OLD_MESSAGE_AGE_MS;
    const maxPerChannel = APP_CONFIG.MAX_MESSAGES_PER_CHANNEL;
    const maxTotal = APP_CONFIG.MAX_MESSAGES_TOTAL;

    this.channelMessagesSignal.update((store) => {
      const newStore: Record<string, ChatMessage[]> = {};
      let totalMessages = 0;

      // First pass: remove old messages and limit per channel
      for (const [channelId, messages] of Object.entries(store)) {
        const filtered = messages.filter((msg) => {
          const msgTime = new Date(msg.timestamp).getTime();
          return now - msgTime < maxAge;
        });

        // Keep only the most recent messages
        const limited = filtered.slice(0, maxPerChannel);

        if (limited.length > 0) {
          newStore[channelId] = limited;
          totalMessages += limited.length;
        }
      }

      // Second pass: if still over total limit, remove from oldest channels
      if (totalMessages > maxTotal) {
        const channelsByOldest = Object.entries(newStore).sort((a, b) => {
          const aTime = a[1][0] ? new Date(a[1][0].timestamp).getTime() : 0;
          const bTime = b[1][0] ? new Date(b[1][0].timestamp).getTime() : 0;
          return aTime - bTime;
        });

        let removed = 0;
        for (const [channelId, messages] of channelsByOldest) {
          if (totalMessages - removed <= maxTotal) break;

          const toRemove = Math.min(messages.length, Math.ceil((totalMessages - maxTotal) * 0.2));
          newStore[channelId] = messages.slice(toRemove);
          removed += toRemove;
        }
      }

      return newStore;
    });

    this.persistChannelMessages();
  }

  /**
   * Clear messages for a specific channel (memory cleanup)
   */
  clearChannel(channelId: string): void {
    this.flushPendingBatchesNow();
    this.pendingBatches.delete(channelId);
    this.channelMessagesSignal.update((store) => {
      const newStore = { ...store };
      delete newStore[channelId];
      return newStore;
    });
    this.loadedChannels.update((set) => {
      const newSet = new Set(set);
      newSet.delete(channelId);
      return newSet;
    });
    this.persistChannelMessages();
  }

  /**
   * Clear all messages (full memory reset)
   */
  clearAllMessages(): void {
    this.flushPendingBatchesNow();
    this.pendingBatches.clear();
    this.channelMessagesSignal.set({});
    this.loadedChannels.set(new Set());
    this.historyLoadState.set({});
    this.persistChannelMessages();
  }

  /**
   * Get memory usage stats
   */
  getMemoryStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    const store = this.channelMessagesSignal();
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
