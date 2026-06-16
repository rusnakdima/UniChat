import { computed, inject, Injectable, signal } from "@angular/core";

import { ChatMessage, PlatformType, ChatHistoryLoadState } from "@models/chat.model";

import { UnifiedStorageService } from "@services/storage/unified-storage.service";

@Injectable({
  providedIn: "root",
})
export class ChatStorageService {
  private readonly unified = inject(UnifiedStorageService);

  readonly channelMessages = this.unified.channelMessages;
  readonly loadedChannelsSet = this.unified.loadedChannelsSet;
  readonly historyLoadStates = this.unified.historyLoadStates;
  readonly allMessages = this.unified.allMessages;
  readonly messagesByPlatform = this.unified.messagesByPlatform;

  incrementMessageVersion(): void {
    this.unified.incrementMessageVersion();
  }

  getChannelRefForMessage(message: Pick<ChatMessage, "platform" | "sourceChannelId">): string {
    return this.unified.getChannelRefForMessage(message);
  }

  isChannelLoaded(channelId: string): boolean {
    return this.unified.isChannelLoaded(channelId);
  }

  markChannelAsLoaded(channelId: string): void {
    this.unified.markChannelAsLoaded(channelId);
  }

  getHistoryLoadState(channelId: string): ChatHistoryLoadState {
    return this.unified.getHistoryLoadState(channelId);
  }

  setHistoryLoadState(channelId: string, state: ChatHistoryLoadState): void {
    this.unified.setHistoryLoadState(channelId, state);
  }

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.unified.getMessagesByChannel(channelId);
  }

  getMessagesByPlatform(platform: PlatformType): ChatMessage[] {
    return this.unified.getMessagesByPlatform(platform);
  }

  addMessage(channelId: string, message: ChatMessage): void {
    this.unified.addMessage(channelId, message);
  }

  prependMessages(channelId: string, messages: ChatMessage[]): void {
    this.unified.prependMessages(channelId, messages);
  }

  removeMessage(channelId: string, messageId: string): void {
    this.unified.removeMessage(channelId, messageId);
  }

  updateMessage(channelId: string, messageId: string, updates: Partial<ChatMessage>): void {
    this.unified.updateMessage(channelId, messageId, updates);
  }

  batchUpdateMessagesForChannel(
    channelId: string,
    updates: Array<{ messageId: string; changes: Partial<ChatMessage> }>
  ): void {
    this.unified.batchUpdateMessagesForChannel(channelId, updates);
  }

  updateChannelMessagesWithBatches(snapshot: Map<string, ChatMessage[]>): void {
    this.unified.updateChannelMessagesWithBatches(snapshot);
  }

  enforceGlobalCap(): void {
    this.unified.enforceGlobalCap();
  }

  exportMessages(): string {
    return this.unified.exportMessages();
  }

  pruneOldMessages(): void {
    this.unified.pruneOldMessages();
  }

  clearChannel(channelId: string): void {
    this.unified.clearChannel(channelId);
  }

  clearAllMessages(): void {
    this.unified.clearAllMessages();
  }

  getMemoryStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    return this.unified.getMemoryStats();
  }
}
