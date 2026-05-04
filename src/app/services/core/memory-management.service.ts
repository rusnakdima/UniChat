/* sys lib */
import { DestroyRef, Injectable, inject } from "@angular/core";

/* services */
import { ChatStorageService } from "@services/data/chat-storage.service";

/* config */
import { APP_CONFIG } from "@config/app.constants";

/**
 * Memory Management Service
 *
 * Responsibility: Prevents memory growth during extended sessions by:
 * - Periodically pruning old messages
 * - Monitoring total message count
 * - Providing memory cleanup utilities
 *
 * Addresses Issue #001: Memory Growth During Extended Sessions
 */
@Injectable({
  providedIn: "root",
})
export class MemoryManagementService {
  private readonly chatStorage = inject(ChatStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private pruneIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopAutoPrune();
    });
  }

  /**
   * Start automatic memory management
   * Call this on application initialization
   */
  startAutoPrune(): void {
    if (this.pruneIntervalId) {
      return; // Already running
    }

    // Prune old messages every minute
    this.pruneIntervalId = setInterval(() => {
      this.pruneOldMessages();
    }, APP_CONFIG.MEMORY_CHECK_INTERVAL_MS);
  }

  /**
   * Stop automatic pruning
   * Call this on application cleanup
   */
  stopAutoPrune(): void {
    if (this.pruneIntervalId) {
      clearInterval(this.pruneIntervalId);
      this.pruneIntervalId = null;
    }
  }

  /**
   * Manually prune old messages.
   * Trims to MAX_MESSAGES_TOTAL by removing oldest messages across all channels.
   */
  pruneOldMessages(): void {
    const stats = this.chatStorage.getMemoryStats();

    // Only prune if we exceed the global cap
    if (stats.totalMessages <= APP_CONFIG.MAX_MESSAGES_TOTAL) {
      return;
    }

    this.chatStorage.pruneOldMessages();
  }

  /**
   * Clear all messages for a channel
   */
  clearChannel(channelId: string): void {
    this.chatStorage.clearChannel(channelId);
  }

  /**
   * Clear all messages (emergency cleanup)
   */
  clearAll(): void {
    this.chatStorage.clearAllMessages();
  }

  /**
   * Get current memory stats
   */
  getStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    return this.chatStorage.getMemoryStats();
  }

  /**
   * Check if memory usage is high
   */
  isMemoryHigh(): boolean {
    const stats = this.getStats();
    return stats.totalMessages > APP_CONFIG.MAX_MESSAGES_TOTAL * 0.8; // 80% warning threshold
  }

  /**
   * Get memory usage as percentage of max
   */
  getMemoryUsagePercent(): number {
    const stats = this.getStats();
    return Math.min(100, (stats.totalMessages / APP_CONFIG.MAX_MESSAGES_TOTAL) * 100);
  }
}
