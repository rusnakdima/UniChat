import { computed, inject, Injectable, signal } from "@angular/core";
import { ChatMessage, ChatHistoryLoadState, PlatformType } from "@models/chat.model";
import { StorageEntityService, StorageEntityServiceImpl } from "./storage-entity.service";
import { StorageCacheService } from "./storage-cache.service";
import { ChatPruningService } from "@services/data/chat-pruning.service";
import { ChatBatchingService } from "@services/data/chat-batching.service";
import { BlockedWordsService } from "@services/ui/blocked-words.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { HighlightNotificationService } from "@services/ui/highlight-notification.service";
import { MessageTypeDetectorService } from "@services/ui/message-type-detector.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";
import { groupByPlatform } from "@shared/utils/chat.helper";
import { buildChannelRef, parseChannelRef } from "@utils/channel-ref.util";
import { APP_CONFIG } from "@shared/utils/constants";

@Injectable({
  providedIn: "root",
})
export class UnifiedStorageService {
  private readonly entity = inject(StorageEntityServiceImpl);
  private readonly cache = inject(StorageCacheService);
  private readonly pruning = inject(ChatPruningService);
  private readonly batching = inject(ChatBatchingService);
  private readonly blockedWords = inject(BlockedWordsService);
  private readonly messagePresentation = inject(ChatMessagePresentationService);
  private readonly highlightNotifications = inject(HighlightNotificationService);
  private readonly messageTypeDetector = inject(MessageTypeDetectorService);
  private readonly overlayBridge = inject(OverlaySourceBridgeService);

  private readonly channelMessagesSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly loadedChannels = signal<Set<string>>(new Set());
  private readonly historyLoadState = signal<Record<string, ChatHistoryLoadState>>({});

  readonly channelMessages = this.channelMessagesSignal.asReadonly();
  readonly loadedChannelsSet = this.loadedChannels.asReadonly();
  readonly historyLoadStates = this.historyLoadState.asReadonly();

  readonly allMessages = computed(() => {
    const currentVersion = this.cache.allMessagesVersion();
    const currentChannelMessages = this.channelMessagesSignal();

    if (this.cache.allMessagesCache().version === currentVersion) {
      return this.cache.allMessagesCache().data;
    }

    const allMessages: ChatMessage[] = [];

    for (const [channelId, messages] of Object.entries(currentChannelMessages)) {
      allMessages.push(...messages);
    }

    const sorted = [...allMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sorted;
  });

  readonly messagesByPlatform = computed(() => {
    return groupByPlatform(this.allMessages());
  });

  constructor() {
    this.cache.setChannelMessagesSignal(() => this.channelMessagesSignal());
  }

  incrementMessageVersion(): void {
    this.cache.incrementMessageVersion();
  }

  getChannelRefForMessage(message: Pick<ChatMessage, "platform" | "sourceChannelId">): string {
    return buildChannelRef(message.platform, message.sourceChannelId);
  }

  isChannelLoaded(channelId: string): boolean {
    const loaded = this.loadedChannels();
    const normalizedInput = channelId.toLowerCase();

    for (const stored of loaded) {
      if (stored.toLowerCase() === normalizedInput) {
        return true;
      }
    }

    const parsed = parseChannelRef(channelId);
    if (parsed) {
      const providerIdLower = parsed.providerChannelId.toLowerCase();
      for (const stored of loaded) {
        if (stored.toLowerCase() === providerIdLower) {
          return true;
        }
      }
    }

    return false;
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
    const storageKey = buildChannelRef(message.platform, channelId);

    this.processMessageFilters(message, storageKey);

    this.batching.addToBatch(storageKey, message);
    this.messageTypeDetector.updateLastMessageTime(message);
    this.batching.scheduleBatchFlush();
  }

  private processMessageFilters(message: ChatMessage, storageKey: string): void {
    const { filtered, wasFiltered } = this.blockedWords.filterMessage(message.text, storageKey);
    if (wasFiltered) {
      message.text = filtered;
    }

    const { type, reason } = this.messageTypeDetector.detectMessageType(message);
    message.messageType = type;
    message.messageTypeReason = reason;
  }

  prependMessages(channelId: string, messages: ChatMessage[]): void {
    this.batching.flushPendingBatchesNow();

    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const platform = messages.length > 0 ? messages[0].platform : "twitch";
    const storageKey = buildChannelRef(platform, channelId);

    for (const message of sortedMessages) {
      this.processMessageFilters(message, storageKey);
    }

    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[storageKey] ?? [];
      const messageMap = new Map(channelMessages.map((msg) => [msg.id, msg]));

      for (const message of messages) {
        messageMap.set(message.id, message);
      }

      const sortedMsgs = [...messageMap.values()].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return {
        ...store,
        [storageKey]: sortedMsgs,
      };
    });

    this.enforceGlobalCap();

    for (const message of sortedMessages) {
      this.messageTypeDetector.updateLastMessageTime(message);
      this.highlightNotifications.maybeNotify(message);
      this.overlayBridge.forwardMessage(message);
    }
  }

  removeMessage(channelId: string, messageId: string): void {
    this.batching.flushPendingBatchesNow();
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
  }

  updateMessage(channelId: string, messageId: string, updates: Partial<ChatMessage>): void {
    this.batching.flushPendingBatchesNow();
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

    if (shouldForward) {
      this.overlayBridge.forwardMessage(updated);
    }
  }

  batchUpdateMessagesForChannel(
    channelId: string,
    updates: Array<{ messageId: string; changes: Partial<ChatMessage> }>
  ): void {
    if (updates.length === 0) return;

    this.channelMessagesSignal.update((store) => {
      const messages = store[channelId];
      if (!messages) {
        return store;
      }

      const messageMap = new Map(messages.map((msg) => [msg.id, msg]));

      for (const { messageId, changes } of updates) {
        const existing = messageMap.get(messageId);
        if (existing) {
          messageMap.set(messageId, { ...existing, ...changes });
        }
      }

      return {
        ...store,
        [channelId]: [...messageMap.values()],
      };
    });
  }

  updateChannelMessagesWithBatches(snapshot: Map<string, ChatMessage[]>): void {
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
        const maxPerChannel = APP_CONFIG.MAX_MESSAGES_PER_CHANNEL;
        const sorted = [...messageMap.values()].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const trimmed = sorted.length > maxPerChannel ? sorted.slice(-maxPerChannel) : sorted;
        next = {
          ...next,
          [channelId]: trimmed,
        };
      }
      return next;
    });
  }

  enforceGlobalCap(): void {
    const store = this.channelMessagesSignal();
    const pruned = this.pruning.pruneOldMessages(store);
    if (pruned !== store) {
      this.channelMessagesSignal.set(pruned);
    }
  }

  exportMessages(): string {
    const store = this.channelMessagesSignal();
    return JSON.stringify(store, null, 2);
  }

  pruneOldMessages(): void {
    this.batching.flushPendingBatchesNow();
    this.enforceGlobalCap();
  }

  clearChannel(channelId: string): void {
    this.batching.flushPendingBatchesNow();
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
  }

  clearAllMessages(): void {
    this.batching.flushPendingBatchesNow();
    this.channelMessagesSignal.set({});
    this.loadedChannels.set(new Set());
    this.historyLoadState.set({});
    this.cache.invalidateCache();
  }

  getMemoryStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    const store = this.channelMessagesSignal();
    return this.pruning.getMemoryStats(store);
  }

  async persistMessage(message: ChatMessage): Promise<void> {
    try {
      await this.entity.createChatMessage(message);
    } catch (error) {
      console.error("Failed to persist message:", error);
    }
  }

  async persistMessages(messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      await this.persistMessage(message);
    }
  }

  async loadPersistedMessages(platform: string, channelId: string): Promise<ChatMessage[]> {
    try {
      const messages = await this.entity.getChatMessagesByChannel(platform, channelId);
      return messages;
    } catch (error) {
      console.error("Failed to load persisted messages:", error);
      return [];
    }
  }

  async deletePersistedMessages(platform: string, channelId: string): Promise<void> {
    try {
      await this.entity.deleteChatMessagesByChannel(platform, channelId);
    } catch (error) {
      console.error("Failed to delete persisted messages:", error);
    }
  }
}
