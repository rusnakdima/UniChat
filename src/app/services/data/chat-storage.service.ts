/* sys lib */
import { computed, inject, Injectable, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

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
    // Apply blocked words filtering
    const { filtered, wasFiltered } = this.blockedWordsService.filterMessage(
      message.text,
      channelId
    );
    if (wasFiltered) {
      message.text = filtered;
    }

    // Detect and assign message type before adding
    const { type, reason } = this.messageTypeDetector.detectMessageType(message);
    message.messageType = type;
    message.messageTypeReason = reason;

    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId] ?? [];
      const existingIndex = channelMessages.findIndex((msg) => msg.id === message.id);

      if (existingIndex !== -1) {
        const updatedMessages = [...channelMessages];
        updatedMessages[existingIndex] = message;
        return { ...store, [channelId]: updatedMessages };
      }

      return {
        ...store,
        [channelId]: this.limitMessages(sortMessagesByRecency([...channelMessages, message])),
      };
    });
    this.persistChannelMessages();

    // Update last message time after adding
    this.messageTypeDetector.updateLastMessageTime(message);

    // Forward to overlay via WebSocket (existing)
    this.overlayBridge.forwardMessage(message);

    // Also store in backend for overlay to fetch
    this.sendToOverlayBackend(message);
  }

  private async sendToOverlayBackend(message: ChatMessage): Promise<void> {
    if (!message.canRenderInOverlay || !message.text) {
      return;
    }

    // Use default widget ID (same as overlay view uses)
    const widgetId = APP_CONFIG.DEFAULT_WIDGET_ID;

    try {
      await invoke("sendOverlayMessage", {
        widgetId,
        message: {
          id: message.id,
          platform: message.platform,
          author: message.author,
          text: message.text,
          timestamp: message.timestamp,
          isSupporter: message.isSupporter,
          sourceChannelId: message.sourceChannelId,
          authorAvatarUrl: message.authorAvatarUrl,
          emotes: message.rawPayload.emotes,
        },
      });
    } catch (err) {
      console.warn("[ChatStorage] Failed to send message to overlay backend:", err);
    }
  }

  addMessages(channelId: string, messages: ChatMessage[]): void {
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

    // Also store in backend for overlay to fetch
    for (const message of messages) {
      this.sendToOverlayBackend(message);
    }
  }

  prependMessages(channelId: string, messages: ChatMessage[]): void {
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
}
