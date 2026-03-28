/* sys lib */
import { Injectable, inject } from "@angular/core";

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
  private pruneIntervalId: ReturnType<typeof setInterval> | null = null;

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
   * Manually prune old messages
   * Removes messages older than OLD_MESSAGE_AGE_MS
   */
  pruneOldMessages(): void {
    const stats = this.chatStorage.getMemoryStats();

    // Only prune if we have significant messages
    if (stats.totalMessages < 100) {
      return;
    }

    this.chatStorage.pruneOldMessages();

    const newStats = this.chatStorage.getMemoryStats();
    const removed = stats.totalMessages - newStats.totalMessages;

    if (removed > 0) {
      console.log(
        `[MemoryManagement] Pruned ${removed} old messages (${newStats.totalMessages} remaining)`
      );
    }
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
    return stats.totalMessages > 5000; // Warning threshold
  }

  /**
   * Get memory usage as percentage of max
   */
  getMemoryUsagePercent(): number {
    const stats = this.getStats();
    return Math.min(100, (stats.totalMessages / 10000) * 100);
  }
}
