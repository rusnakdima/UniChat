import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ChatHistoryExportService {
  export(
    channelRef: string,
    options: unknown
  ): Promise<{
    channelRef: string;
    messages: unknown[];
    exportedAt: Date;
  }> {
    return Promise.resolve({ channelRef, messages: [], exportedAt: new Date() });
  }

  exportChannelHistory(channelRef: string, options: unknown): Promise<unknown> {
    return this.export(channelRef, options);
  }
  exportAllHistory(options: unknown): Promise<unknown> {
    return Promise.resolve({});
  }
  getExportStats(): { messageCount: number; oldestTimestamp: number } {
    return { messageCount: 0, oldestTimestamp: 0 };
  }
}
