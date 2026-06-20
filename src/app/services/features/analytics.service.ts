import { Injectable, signal, computed } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

export interface AnalyticsStats {
  viewerCount: number;
  messageCount: number;
  activeChatters: number;
  totalChatMsgsChange: number;
  uniqueChattersChange: number;
  peakViewersChange: number;
  newSubs: number;
  newSubsChange: number;
  peakViewers: number;
  totalChatMsgs: number;
  uniqueChatters: number;
}

export interface PlatformDistribution {
  platform: string;
  percentage: number;
  color: string;
  name: string;
  value: number;
}

@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private _stats = signal<AnalyticsStats>({
    viewerCount: 0,
    messageCount: 0,
    activeChatters: 0,
    totalChatMsgsChange: 0,
    uniqueChattersChange: 0,
    peakViewersChange: 0,
    newSubs: 0,
    newSubsChange: 0,
    peakViewers: 0,
    totalChatMsgs: 0,
    uniqueChatters: 0,
  });
  private _previousPeriod = signal<AnalyticsStats>({
    viewerCount: 0,
    messageCount: 0,
    activeChatters: 0,
    totalChatMsgsChange: 0,
    uniqueChattersChange: 0,
    peakViewersChange: 0,
    newSubs: 0,
    newSubsChange: 0,
    peakViewers: 0,
    totalChatMsgs: 0,
    uniqueChatters: 0,
  });

  getAnalytics(): AnalyticsStats {
    return this._stats();
  }
  computeStats(
    _filteredMessages: ChatMessage[],
    _connections: unknown[],
    _previousMessages: unknown
  ): AnalyticsStats {
    return this._stats();
  }
  computePlatformDistribution(_filteredMessages: ChatMessage[]): PlatformDistribution[] {
    return [];
  }
  filterMessagesByTimeRange(_messages: ChatMessage[], _timeRange: string): ChatMessage[] {
    return [];
  }
  getPreviousPeriodMessages(): AnalyticsStats {
    return this._previousPeriod();
  }
}
