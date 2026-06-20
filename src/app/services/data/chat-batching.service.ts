import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ChatBatchingService {
  addToBatch(_key: string, _message: unknown): void {}
  flushBatch(): void {}
  flushPendingBatchesNow(): void {}
  scheduleBatchFlush(): void {}
}
