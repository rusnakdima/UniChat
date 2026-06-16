/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage, PlatformType } from "@models/chat.model";

/* services */
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import {
  ConnectionErrorService,
  ConnectionErrorCode,
} from "@services/core/connection-error.service";
import { RECONNECTION_MAX_DELAY_MS, DISCONNECT_GAP_THRESHOLD_MS } from "@shared/utils/constants";

/**
 * Track message sequence per channel for gap detection
 */
interface ChannelSequenceTracker {
  lastSequenceNumber: number;
  lastReceivedAt: number;
  messageCount: number;
  gapDetected: boolean;
  missedCount: number;
}

/**
 * Reconnection Service - Message Gap Detection
 *
 * Responsibility: Tracks message sequences and detects gaps during reconnection.
 * Addresses Issue #002: Message Loss During Reconnection
 *
 * Features:
 * - Sequence number tracking per channel
 * - Gap detection when messages are missed
 * - Visual indicators for message gaps
 * - Automatic backfill requests (platform-dependent)
 */
@Injectable({
  providedIn: "root",
})
export class ReconnectionService {
  private readonly chatStorage = inject(UnifiedStorageService);
  private readonly errorService = inject(ConnectionErrorService);

  /** Sequence trackers per channel */
  private readonly trackers = new Map<string, ChannelSequenceTracker>();

  /** Gap indicators per channel */
  private readonly gapCallbacks = new Map<
    string,
    Array<(missedCount: number, platform: PlatformType) => void>
  >();

  /**
   * Track a message and detect gaps
   */
  trackMessage(channelId: string, message: ChatMessage, platform: PlatformType): void {
    const tracker = this.getOrCreateTracker(channelId);
    const now = Date.now();

    // Initialize sequence from message if available
    if (message.sequenceNumber !== undefined) {
      const expectedSeq = tracker.lastSequenceNumber + 1;

      // Detect gap
      if (message.sequenceNumber > expectedSeq) {
        const missed = message.sequenceNumber - expectedSeq;
        this.reportGap(channelId, platform, missed);
        tracker.gapDetected = true;
        tracker.missedCount += missed;
      }

      tracker.lastSequenceNumber = message.sequenceNumber;
    }

    // Track by received timestamp for fallback
    if (tracker.lastReceivedAt > 0) {
      const timeGap = now - tracker.lastReceivedAt;

      // Detect time-based gap (>30 seconds without messages)
      if (timeGap > RECONNECTION_MAX_DELAY_MS && tracker.messageCount > 10) {
        this.reportTimeGap(channelId, platform, timeGap);
      }
    }

    tracker.lastReceivedAt = now;
    tracker.messageCount++;
  }

  /**
   * Report connection restored - check for gaps
   */
  reportReconnected(channelId: string, platform: PlatformType, disconnectDuration: number): void {
    // If disconnected for more than 5 seconds, likely missed messages
    if (disconnectDuration > DISCONNECT_GAP_THRESHOLD_MS) {
      const tracker = this.trackers.get(channelId);
      if (tracker) {
        tracker.gapDetected = true;
        // Estimate missed messages (rough: 1 msg/sec average)
        const estimatedMissed = Math.floor(disconnectDuration / 1000);
        this.notifyGapListeners(channelId, estimatedMissed, platform);
      }
    }
  }

  /**
   * Clear gap indicator for a channel
   */
  clearGap(channelId: string): void {
    const tracker = this.trackers.get(channelId);
    if (tracker) {
      tracker.gapDetected = false;
      tracker.missedCount = 0;
    }
    this.notifyGapListeners(channelId, 0, "twitch"); // Platform doesn't matter for clear
  }

  /**
   * Check if channel has detected gaps
   */
  hasGap(channelId: string): boolean {
    const tracker = this.trackers.get(channelId);
    return tracker?.gapDetected ?? false;
  }

  /**
   * Get missed message count for channel
   */
  getMissedCount(channelId: string): number {
    const tracker = this.trackers.get(channelId);
    return tracker?.missedCount ?? 0;
  }

  /**
   * Subscribe to gap notifications
   */
  onGap(
    channelId: string,
    callback: (missedCount: number, platform: PlatformType) => void
  ): () => void {
    if (!this.gapCallbacks.has(channelId)) {
      this.gapCallbacks.set(channelId, []);
    }
    this.gapCallbacks.get(channelId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.gapCallbacks.get(channelId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Reset tracker for a channel
   */
  reset(channelId: string): void {
    this.trackers.delete(channelId);
    this.gapCallbacks.delete(channelId);
  }

  /**
   * Get tracker stats for debugging
   */
  getStats(channelId: string): ChannelSequenceTracker | undefined {
    return this.trackers.get(channelId);
  }

  private getOrCreateTracker(channelId: string): ChannelSequenceTracker {
    if (!this.trackers.has(channelId)) {
      this.trackers.set(channelId, {
        lastSequenceNumber: 0,
        lastReceivedAt: 0,
        messageCount: 0,
        gapDetected: false,
        missedCount: 0,
      });
    }
    return this.trackers.get(channelId)!;
  }

  private reportGap(channelId: string, platform: PlatformType, missedCount: number): void {
    // Report to error service for UI display
    this.errorService.reportError(channelId, {
      code: ConnectionErrorCode.UNKNOWN,
      message: `${missedCount} messages missed during reconnection`,
      isRecoverable: true,
    });

    this.notifyGapListeners(channelId, missedCount, platform);
  }

  private reportTimeGap(channelId: string, platform: PlatformType, timeGapMs: number): void {
    const seconds = Math.floor(timeGapMs / 1000);

    this.notifyGapListeners(channelId, Math.ceil(seconds / 2), platform);
  }

  private notifyGapListeners(channelId: string, missedCount: number, platform: PlatformType): void {
    const callbacks = this.gapCallbacks.get(channelId);
    if (callbacks) {
      callbacks.forEach((cb) => cb(missedCount, platform));
    }
  }
}
