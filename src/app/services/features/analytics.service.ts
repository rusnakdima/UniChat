/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage, ChannelConnection, PlatformType } from "@models/chat.model";

/* services */
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { ConnectionStateService } from "@services/data/connection-state.service";

export interface AnalyticsStats {
  peakViewers: number;
  peakViewersChange: number;
  totalChatMsgs: number;
  totalChatMsgsChange: number;
  newSubs: number;
  newSubsChange: number;
  uniqueChatters: number;
  uniqueChattersChange: number;
}

export interface PlatformDistribution {
  name: string;
  value: number;
  color: string;
}

const PLATFORM_COLORS: Record<PlatformType, string> = {
  twitch: "bg-[#9146ff]",
  youtube: "bg-[#ff0000]",
  kick: "bg-[#53fc18]",
};

const PLATFORM_NAMES: Record<PlatformType, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
};

@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  private readonly chatStorageService = inject(UnifiedStorageService);
  private readonly connectionStateService = inject(ConnectionStateService);

  readonly allMessages = this.chatStorageService.allMessages;
  readonly connections = this.connectionStateService.connections;

  filterMessagesByTimeRange(messages: ChatMessage[], timeRange: string): ChatMessage[] {
    const now = Date.now();
    const ranges: Record<string, number> = {
      "Last 24 Hours": 24 * 60 * 60 * 1000,
      "Last 7 Days": 7 * 24 * 60 * 60 * 1000,
    };

    const cutoff = ranges[timeRange];
    if (!cutoff) {
      return messages;
    }

    const cutoffTime = now - cutoff;
    return messages.filter((msg) => {
      const msgTime = new Date(msg.timestamp).getTime();
      return msgTime >= cutoffTime;
    });
  }

  getPreviousPeriodMessages(messages: ChatMessage[], timeRange: string): ChatMessage[] {
    const now = Date.now();
    const ranges: Record<string, number> = {
      "Last 24 Hours": 24 * 60 * 60 * 1000,
      "Last 7 Days": 7 * 24 * 60 * 60 * 1000,
    };

    const period = ranges[timeRange];
    if (!period) {
      return [];
    }

    const currentPeriodStart = now - period;
    const previousPeriodStart = currentPeriodStart - period;

    return messages.filter((msg) => {
      const msgTime = new Date(msg.timestamp).getTime();
      return msgTime >= previousPeriodStart && msgTime < currentPeriodStart;
    });
  }

  computeStats(
    messages: ChatMessage[],
    connections: ChannelConnection[],
    previousMessages: ChatMessage[]
  ): AnalyticsStats {
    const peakViewers = Math.max(0, ...connections.map((c) => c.viewers));

    const prevPeakViewers =
      previousMessages.length > 0
        ? Math.max(0, ...connections.map((c) => Math.floor(c.viewers * 0.9)))
        : peakViewers;
    const peakViewersChange =
      prevPeakViewers > 0
        ? Math.round(((peakViewers - prevPeakViewers) / prevPeakViewers) * 100)
        : 0;

    const totalChatMsgs = messages.length;

    const prevTotalChatMsgs = previousMessages.length;
    const totalChatMsgsChange =
      prevTotalChatMsgs > 0
        ? Math.round(((totalChatMsgs - prevTotalChatMsgs) / prevTotalChatMsgs) * 100)
        : 0;

    const uniqueAuthorSet = new Set<string>();
    for (const msg of messages) {
      if (msg.author && !msg.isDeleted) {
        uniqueAuthorSet.add(msg.author.toLowerCase());
      }
    }
    const uniqueChatters = uniqueAuthorSet.size;

    const prevUniqueAuthorSet = new Set<string>();
    for (const msg of previousMessages) {
      if (msg.author && !msg.isDeleted) {
        prevUniqueAuthorSet.add(msg.author.toLowerCase());
      }
    }
    const prevUniqueChatters = prevUniqueAuthorSet.size;
    const uniqueChattersChange =
      prevUniqueChatters > 0
        ? Math.round(((uniqueChatters - prevUniqueChatters) / prevUniqueChatters) * 100)
        : 0;

    return {
      peakViewers,
      peakViewersChange,
      totalChatMsgs,
      totalChatMsgsChange,
      newSubs: 0,
      newSubsChange: 0,
      uniqueChatters,
      uniqueChattersChange,
    };
  }

  computePlatformDistribution(messages: ChatMessage[]): PlatformDistribution[] {
    const platformCounts = new Map<PlatformType, number>();

    for (const msg of messages) {
      if (!msg.isDeleted) {
        const count = platformCounts.get(msg.platform) ?? 0;
        platformCounts.set(msg.platform, count + 1);
      }
    }

    const total = messages.filter((m) => !m.isDeleted).length;
    if (total === 0) {
      return [];
    }

    const distribution: PlatformDistribution[] = [];
    for (const [platform, count] of platformCounts) {
      distribution.push({
        name: PLATFORM_NAMES[platform],
        value: Math.round((count / total) * 100),
        color: PLATFORM_COLORS[platform],
      });
    }

    return distribution.sort((a, b) => b.value - a.value);
  }
}
