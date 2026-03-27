import { Injectable, signal, computed, inject } from "@angular/core";
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatMessage } from "@models/chat.model";

export interface PinnedMessage {
  id: string;
  messageId: string;
  channelId: string;
  platform: ChatMessage['platform'];
  author: string;
  text: string;
  timestamp: string;
  pinnedAt: string;
  note?: string; // Optional user note
}

const PINNED_MESSAGES_STORAGE_KEY = "unichat.pinnedMessages.v1";

/**
 * Pinned Messages Service - Bookmarks for important messages
 *
 * Responsibility: Manages pinned/bookmarked messages across sessions.
 * Pinned messages persist in localStorage and survive app restarts.
 */
@Injectable({
  providedIn: "root",
})
export class PinnedMessagesService {
  private readonly localStorageService = inject(LocalStorageService);

  private readonly pinnedSignal = signal<PinnedMessage[]>([]);

  readonly pinnedMessages = this.pinnedSignal.asReadonly();
  readonly pinnedCount = computed(() => this.pinnedSignal().length);
  readonly hasPinnedMessages = computed(() => this.pinnedSignal().length > 0);

  constructor() {
    this.loadPinnedMessages();
  }

  private loadPinnedMessages(): void {
    const stored = this.localStorageService.get<PinnedMessage[]>(PINNED_MESSAGES_STORAGE_KEY, []);
    this.pinnedSignal.set(stored);
  }

  private persistPinnedMessages(): void {
    this.localStorageService.set(PINNED_MESSAGES_STORAGE_KEY, this.pinnedSignal());
  }

  /**
   * Pin a message
   */
  pinMessage(message: ChatMessage, note?: string): PinnedMessage {
    // Check if already pinned
    const existing = this.pinnedSignal().find(pm => pm.messageId === message.id);
    if (existing) {
      return existing;
    }

    const pinned: PinnedMessage = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      messageId: message.id,
      channelId: message.sourceChannelId,
      platform: message.platform,
      author: message.author,
      text: message.text,
      timestamp: message.timestamp,
      pinnedAt: new Date().toISOString(),
      note,
    };

    this.pinnedSignal.update(pins => [...pins, pinned]);
    this.persistPinnedMessages();
    return pinned;
  }

  /**
   * Unpin a message by its pinned ID
   */
  unpinMessage(pinnedId: string): void {
    this.pinnedSignal.update(pins => pins.filter(pin => pin.id !== pinnedId));
    this.persistPinnedMessages();
  }

  /**
   * Unpin a message by its original message ID
   */
  unpinByMessageId(messageId: string): void {
    this.pinnedSignal.update(pins => pins.filter(pin => pin.messageId !== messageId));
    this.persistPinnedMessages();
  }

  /**
   * Check if a message is pinned
   */
  isPinned(messageId: string): boolean {
    return this.pinnedSignal().some(pin => pin.messageId === messageId);
  }

  /**
   * Get pinned message by original message ID
   */
  getPinnedByMessageId(messageId: string): PinnedMessage | undefined {
    return this.pinnedSignal().find(pin => pin.messageId === messageId);
  }

  /**
   * Update pin note
   */
  updateNote(pinnedId: string, note: string): void {
    this.pinnedSignal.update(pins =>
      pins.map(pin => pin.id === pinnedId ? { ...pin, note } : pin)
    );
    this.persistPinnedMessages();
  }

  /**
   * Get pinned messages for a specific channel
   */
  getPinnedForChannel(channelId: string): PinnedMessage[] {
    return this.pinnedSignal().filter(pin => pin.channelId === channelId);
  }

  /**
   * Get pinned messages for a specific platform
   */
  getPinnedForPlatform(platform: ChatMessage['platform']): PinnedMessage[] {
    return this.pinnedSignal().filter(pin => pin.platform === platform);
  }

  /**
   * Clear all pinned messages
   */
  clearAll(): void {
    this.pinnedSignal.set([]);
    this.persistPinnedMessages();
  }

  /**
   * Export pinned messages as JSON
   */
  exportPinned(): string {
    return JSON.stringify(this.pinnedSignal(), null, 2);
  }

  /**
   * Import pinned messages from JSON
   */
  importPinned(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as PinnedMessage[];
      if (!Array.isArray(parsed)) {
        return false;
      }
      
      // Validate structure
      const valid = parsed.every(pin =>
        typeof pin.id === 'string' &&
        typeof pin.messageId === 'string' &&
        typeof pin.channelId === 'string' &&
        typeof pin.author === 'string' &&
        typeof pin.text === 'string' &&
        typeof pin.timestamp === 'string' &&
        typeof pin.pinnedAt === 'string'
      );

      if (!valid) {
        return false;
      }

      this.pinnedSignal.set(parsed);
      this.persistPinnedMessages();
      return true;
    } catch {
      return false;
    }
  }
}
