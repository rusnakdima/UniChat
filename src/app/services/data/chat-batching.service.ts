export class ChatBatchingService {
  addToBatch(key: string, message: unknown): void {}
  flushBatch(): void {}
  flushPendingBatchesNow(): void {}
  scheduleBatchFlush(): void {}
}
