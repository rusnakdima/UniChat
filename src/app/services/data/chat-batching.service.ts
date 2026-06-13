import { Injectable, inject, signal } from "@angular/core";

import { ChatMessage } from "@models/chat.model";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { ChatPruningService } from "@services/data/chat-pruning.service";
import { HighlightNotificationService } from "@services/ui/highlight-notification.service";
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";

import { APP_CONFIG } from "@config/app.constants";

@Injectable({
  providedIn: "root",
})
export class ChatBatchingService {
  private readonly storage = inject(ChatStorageService);
  private readonly pruning = inject(ChatPruningService);
  private readonly highlightNotifications = inject(HighlightNotificationService);
  private readonly overlayBridge = inject(OverlaySourceBridgeService);

  private readonly pendingBatches = new Map<string, ChatMessage[]>();
  private batchRafId: number | null = null;

  scheduleBatchFlush(): void {
    if (this.batchRafId !== null) {
      return;
    }
    this.batchRafId = requestAnimationFrame(() => {
      this.batchRafId = null;
      this.flushBatches();
    });
  }

  flushBatches(): void {
    if (this.pendingBatches.size === 0) {
      return;
    }
    const snapshot = new Map(this.pendingBatches);
    this.pendingBatches.clear();

    this.storage.updateChannelMessagesWithBatches(snapshot);

    this.storage.enforceGlobalCap();
    this.storage.incrementMessageVersion();

    for (const incoming of snapshot.values()) {
      for (const message of incoming) {
        this.highlightNotifications.maybeNotify(message);
        this.overlayBridge.forwardMessage(message);
      }
    }
  }

  flushPendingBatchesNow(): void {
    if (this.batchRafId !== null) {
      cancelAnimationFrame(this.batchRafId);
      this.batchRafId = null;
    }
    this.flushBatches();
  }

  addToBatch(storageKey: string, message: ChatMessage): void {
    const q = this.pendingBatches.get(storageKey);
    if (q) {
      q.push(message);
    } else {
      this.pendingBatches.set(storageKey, [message]);
    }
  }

  getBatchSize(): number {
    return this.pendingBatches.size;
  }

  hasPendingBatches(): boolean {
    return this.pendingBatches.size > 0 || this.batchRafId !== null;
  }
}
