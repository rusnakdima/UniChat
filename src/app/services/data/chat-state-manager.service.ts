/* sys lib */
import { Injectable, signal } from "@angular/core";
/**
 * Chat State Manager - Session Connection Tracking
 *
 * Responsibility: Tracks which channels have been connected in the current session
 * and provides initialization state management.
 *
 * This service does NOT own message data. It only tracks:
 * - Which channels have been connected this session (to avoid reconnecting on navigation)
 * - Whether the chat system has been initialized
 *
 * Source of Truth Hierarchy:
 * 1. ChatStorageService - Primary message storage (owns the data)
 * 2. ChatStateService - Computed state (derived from storage)
 * 3. ChatStateManagerService - Session connection tracking <-- THIS SERVICE
 * 4. ConnectionStateService - Connection status per channel (connecting/connected/disconnected)
 *
 * @see ChatStorageService for data persistence
 * @see ChatStateService for computed message state
 * @see ConnectionStateService for connection status
 */
@Injectable({
  providedIn: "root",
})
export class ChatStateManagerService {
  // Track which channels have been connected in this session
  private readonly connectedChannelsSignal = signal<Set<string>>(new Set());

  // Track initialization state
  private readonly isInitializedSignal = signal(false);

  // Public read-only signals
  readonly connectedChannelsSet = this.connectedChannelsSignal.asReadonly();
  readonly isInitialized = this.isInitializedSignal.asReadonly();

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
}
