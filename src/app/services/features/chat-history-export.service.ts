/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { PlatformType } from "@models/chat.model";

/* services */
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { buildChannelRef } from "@utils/channel-ref.util";
import { ChatHistoryFormatter } from "./chat-history-formatter";

export type ExportFormat = "json" | "txt" | "csv";

export interface ExportOptions {
  format: ExportFormat;
  includeTimestamps: boolean;
  includePlatform: boolean;
  includeBadges: boolean;
  dateFormat: "iso" | "time" | "custom";
  customDateFormat?: string;
}

@Injectable({
  providedIn: "root",
})
export class ChatHistoryExportService {
  private readonly chatStorage = inject(UnifiedStorageService);
  private readonly chatList = inject(ChatListService);
  private readonly formatter = new ChatHistoryFormatter();

  async exportChannelHistory(
    channelId: string,
    platform: PlatformType,
    options: ExportOptions = {
      format: "txt",
      includeTimestamps: true,
      includePlatform: false,
      includeBadges: false,
      dateFormat: "time",
    }
  ): Promise<void> {
    const messages = this.chatStorage.getMessagesByChannel(buildChannelRef(platform, channelId));
    const channel = this.chatList.getChannels(platform).find((ch) => ch.channelId === channelId);
    const channelName = channel?.channelName ?? channelId;

    const content = this.formatter.formatMessages(messages, options);
    const filename = this.formatter.generateFilename(channelName, platform, options.format);

    await this.saveFile(content, filename, this.formatter.getMimeType(options.format));
  }

  async exportAllHistory(
    options: ExportOptions = {
      format: "json",
      includeTimestamps: true,
      includePlatform: true,
      includeBadges: true,
      dateFormat: "iso",
    }
  ): Promise<void> {
    const allChannels = this.chatList.getVisibleChannels();
    const allMessages: Record<string, import("@models/chat.model").ChatMessage[]> = {};

    for (const channel of allChannels) {
      const messages = this.chatStorage.getMessagesByChannel(
        buildChannelRef(channel.platform, channel.channelId)
      );
      if (messages.length > 0) {
        allMessages[`${channel.platform}:${channel.channelId}`] = messages;
      }
    }

    const content = this.formatter.formatMessagesAllChannels(allMessages, options);
    const filename = `unichat-export-all-${this.formatter.formatDate(new Date(), "iso")}.${options.format}`;

    await this.saveFile(content, filename, this.formatter.getMimeType(options.format));
  }

  private async saveFile(content: string, filename: string, mimeType: string): Promise<void> {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error(`Export failed: ${error}`);
    }
  }

  getExportStats(): {
    totalChannels: number;
    totalMessages: number;
    byPlatform: Record<PlatformType, number>;
  } {
    const allChannels = this.chatList.getVisibleChannels();
    const byPlatform: Record<PlatformType, number> = {
      twitch: 0,
      kick: 0,
      youtube: 0,
    };

    let totalMessages = 0;
    for (const channel of allChannels) {
      const messages = this.chatStorage.getMessagesByChannel(
        buildChannelRef(channel.platform, channel.channelId)
      );
      byPlatform[channel.platform] += messages.length;
      totalMessages += messages.length;
    }

    return {
      totalChannels: allChannels.length,
      totalMessages,
      byPlatform,
    };
  }
}
