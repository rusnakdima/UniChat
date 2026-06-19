import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ChatBatchingService {
  addToBatch(message: unknown): void {}
  flushBatch(): void {}
  flushPendingBatchesNow(): void {}
  scheduleBatchFlush(): void {}
}
