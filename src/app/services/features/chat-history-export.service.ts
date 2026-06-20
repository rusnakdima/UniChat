import { Injectable } from "@angular/core";

export type ExportFormat = "json" | "csv" | "txt";

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

  exportChannelHistory(channelRef: string, _platform: unknown, options: unknown): Promise<unknown> {
    return this.export(channelRef, options);
  }
  exportAllHistory(options: unknown): Promise<unknown> {
    return Promise.resolve({});
  }
  getExportStats(): {
    totalChannels: number;
    totalMessages: number;
    byPlatform: { twitch: number; kick: number; youtube: number };
  } {
    return { totalChannels: 0, totalMessages: 0, byPlatform: { twitch: 0, kick: 0, youtube: 0 } };
  }
}
