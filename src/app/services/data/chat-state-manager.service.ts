import { Injectable, computed, inject, signal } from "@angular/core";
import { ChatMessage, PlatformType, ChatHistoryLoadState } from "@models/chat.model";
import { ChatStorageService } from "@services/data/chat-storage.service";

/**
 * Centralized state manager for chat messages and channel connections.
 * Follows TaskFlow's StorageService pattern - single source of truth.
 *
 * Key features:
 * - Holds all message state in Angular Signals
 * - Persists across navigation (not reset on component re-render)
 * - Tracks connection state per channel globally
 * - Provides computed signals for derived state
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
