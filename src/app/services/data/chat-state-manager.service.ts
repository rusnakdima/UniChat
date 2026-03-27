import { Injectable, computed, inject, signal } from "@angular/core";
import { ChatMessage, PlatformType, ChatHistoryLoadState } from "@models/chat.model";
import { ChatStorageService } from "@services/data/chat-storage.service";

/**
 * Chat State Manager - Session Connection Tracking
 *
 * Responsibility: Tracks which channels have been connected in the current session.
 * This is a lightweight wrapper for session-level connection state.
 *
 * Source of Truth Hierarchy:
 * 1. ChatStorageService - Primary message storage (owns the data)
 * 2. ChatStateService - Computed state (derived from storage)
 * 3. ChatStateManagerService - Connection tracking (session state) <-- THIS SERVICE
 * 4. ConnectionStateService - Connection status per channel
 *
 * Note: This service does NOT own message data. It only tracks connection state.
 *
 * @see ChatStorageService for data persistence
 * @see ChatStateService for computed message state
 * @see ConnectionStateService for connection status
 */
@Injectable({
  providedIn: "root",
})
export class ChatStateManagerService {
  private readonly chatStorageService = inject(ChatStorageService);

  // Track which channels have been connected in this session
  private readonly connectedChannelsSignal = signal<Set<string>>(new Set());

  // Track initialization state
  private readonly isInitializedSignal = signal(false);

  // Public read-only signals
  readonly connectedChannelsSet = this.connectedChannelsSignal.asReadonly();
  readonly isInitialized = this.isInitializedSignal.asReadonly();

  // Computed: all messages from storage
  readonly allMessages = computed(() => this.chatStorageService.allMessages());

  // Computed: messages by platform
  readonly messagesByPlatform = computed(() => this.chatStorageService.messagesByPlatform);

  /**
   * Mark the chat system as initialized (called once on app start or resolver)
   */
  markAsInitialized(): void {
    this.isInitializedSignal.set(true);
  }

  /**
   * Check if a channel is already connected in this session
   */
  isChannelConnected(channelId: string): boolean {
    return this.connectedChannelsSignal().has(channelId);
  }

  /**
   * Mark a channel as connected (called after successful connection)
   */
  markChannelAsConnected(channelId: string): void {
    this.connectedChannelsSignal.update((set) => {
      const newSet = new Set(set);
      newSet.add(channelId);
      return newSet;
    });
  }

  /**
   * Mark a channel as disconnected
   */
  markChannelAsDisconnected(channelId: string): void {
    this.connectedChannelsSignal.update((set) => {
      const newSet = new Set(set);
      newSet.delete(channelId);
      return newSet;
    });
  }

  // Delegate storage operations to ChatStorageService

  addMessage(channelId: string, message: ChatMessage): void {
    this.chatStorageService.addMessage(channelId, message);
  }

  addMessages(channelId: string, messages: ChatMessage[]): void {
    this.chatStorageService.addMessages(channelId, messages);
  }

  prependMessages(channelId: string, messages: ChatMessage[]): void {
    this.chatStorageService.prependMessages(channelId, messages);
  }

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.chatStorageService.getMessagesByChannel(channelId);
  }

  isChannelLoaded(channelId: string): boolean {
    return this.chatStorageService.isChannelLoaded(channelId);
  }

  markChannelAsLoaded(channelId: string): void {
    this.chatStorageService.markChannelAsLoaded(channelId);
  }

  getHistoryLoadState(channelId: string): ChatHistoryLoadState {
    return this.chatStorageService.getHistoryLoadState(channelId);
  }

  setHistoryLoadState(channelId: string, state: ChatHistoryLoadState): void {
    this.chatStorageService.setHistoryLoadState(channelId, state);
  }
}
