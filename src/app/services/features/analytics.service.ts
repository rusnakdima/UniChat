import { Injectable, signal, computed } from "@angular/core";

export interface AnalyticsStats {
  viewerCount: number;
  messageCount: number;
  activeChatters: number;
  totalChatMsgsChange?: number;
  uniqueChattersChange?: number;
  peakViewersChange?: number;
  newSubs?: number;
  newSubsChange?: number;
  peakViewers?: number;
  totalChatMsgs?: number;
  uniqueChatters?: number;
}

export interface PlatformDistribution {
  platform: string;
  percentage: number;
  color?: string;
  name?: string;
  value?: number;
}

@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private _stats = signal<AnalyticsStats>({ viewerCount: 0, messageCount: 0, activeChatters: 0 });
  private _previousPeriod = signal<AnalyticsStats>({
    viewerCount: 0,
    messageCount: 0,
    activeChatters: 0,
  });

  getAnalytics(): AnalyticsStats {
    return this._stats();
  }
  computeStats(): AnalyticsStats {
    return this._stats();
  }
  computePlatformDistribution(): PlatformDistribution[] {
    return [{ platform: "twitch", percentage: 100 }];
  }
  filterMessagesByTimeRange(start: Date, end: Date): unknown[] {
    return [];
  }
  getPreviousPeriodMessages(): AnalyticsStats {
    return this._previousPeriod();
  }
}
