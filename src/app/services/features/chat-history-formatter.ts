/**
 * Chat History Formatter
 *
 * Formats chat messages for export in various formats (JSON, TXT, CSV).
 */

import { ChatMessage, PlatformType } from "@models/chat.model";
import { ExportFormat, ExportOptions } from "./chat-history-export.service";
import { generateTimestamp } from "@shared/utils/chat.helper";

export class ChatHistoryFormatter {
  formatMessages(messages: ChatMessage[], options: ExportOptions): string {
    switch (options.format) {
      case "json":
        return this.formatJson(messages, options);
      case "txt":
        return this.formatTxt(messages, options);
      case "csv":
        return this.formatCsv(messages, options);
      default:
        return this.formatTxt(messages, options);
    }
  }

  formatMessagesAllChannels(
    messagesByChannel: Record<string, ChatMessage[]>,
    options: ExportOptions
  ): string {
    if (options.format === "json") {
      const exportData = {
        exportedAt: generateTimestamp(),
        totalChannels: Object.keys(messagesByChannel).length,
        totalMessages: Object.values(messagesByChannel).reduce((sum, msgs) => sum + msgs.length, 0),
        channels: messagesByChannel,
      };
      return JSON.stringify(exportData, null, 2);
    }

    const parts: string[] = [];
    for (const [channelKey, messages] of Object.entries(messagesByChannel)) {
      parts.push(`=== Channel: ${channelKey} ===\n`);
      parts.push(this.formatMessages(messages, options));
      parts.push("\n\n");
    }
    return parts.join("");
  }

  private formatJson(messages: ChatMessage[], options: ExportOptions): string {
    const exportData = {
      exportedAt: generateTimestamp(),
      messageCount: messages.length,
      messages: messages.map((msg) => ({
        id: msg.id,
        timestamp: this.formatDate(new Date(msg.timestamp), options.dateFormat),
        platform: options.includePlatform ? msg.platform : undefined,
        author: msg.author,
        text: msg.text,
        badges: options.includeBadges ? msg.badges : undefined,
        isSupporter: msg.isSupporter,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  private formatTxt(messages: ChatMessage[], options: ExportOptions): string {
    return messages
      .map((msg) => {
        const parts: string[] = [];

        if (options.includeTimestamps) {
          parts.push(`[${this.formatDate(new Date(msg.timestamp), options.dateFormat)}]`);
        }

        if (options.includePlatform) {
          parts.push(`[${msg.platform.toUpperCase()}]`);
        }

        parts.push(`<${msg.author}>`);

        if (options.includeBadges && msg.badges.length > 0) {
          parts.push(`[${msg.badges.join(", ")}]`);
        }

        parts.push(msg.text);

        return parts.join(" ");
      })
      .join("\n");
  }

  private formatCsv(messages: ChatMessage[], options: ExportOptions): string {
    const headers = ["Timestamp", "Platform", "Author", "Badges", "Text"];
    const rows = [headers.join(",")];

    for (const msg of messages) {
      const row = [
        this.escapeCsvField(this.formatDate(new Date(msg.timestamp), options.dateFormat)),
        options.includePlatform ? this.escapeCsvField(msg.platform) : "",
        this.escapeCsvField(msg.author),
        options.includeBadges ? this.escapeCsvField(msg.badges.join("; ")) : "",
        this.escapeCsvField(msg.text),
      ];
      rows.push(row.join(","));
    }

    return rows.join("\n");
  }

  private escapeCsvField(field: string): string {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  formatDate(date: Date, format: ExportOptions["dateFormat"]): string {
    switch (format) {
      case "iso":
        return date.toISOString();
      case "time":
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      case "custom":
        return date.toLocaleString();
      default:
        return date.toLocaleTimeString();
    }
  }

  getMimeType(format: ExportFormat): string {
    switch (format) {
      case "json":
        return "application/json";
      case "txt":
        return "text/plain";
      case "csv":
        return "text/csv";
      default:
        return "text/plain";
    }
  }

  generateFilename(
    channelName: string,
    platform: PlatformType,
    format: ExportFormat
  ): string {
    const timestamp = this.formatDate(new Date(), "iso").replace(/[:.]/g, "-");
    const safeChannelName = channelName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    return `unichat-${platform}-${safeChannelName}-${timestamp}.${format}`;
  }
}