/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { ChatStorageService } from "@services/data/chat-storage.service";
export interface ExportOptions {
  format: "json" | "csv";
  includeMetadata?: boolean;
  channels?: string[]; // Specific channel IDs to export, or all if undefined
  platforms?: ChatMessage["platform"][]; // Specific platforms to export
  startTime?: string; // ISO timestamp
  endTime?: string; // ISO timestamp
}

/**
 * Session Export Service - Chat Log Export
 *
 * Responsibility: Exports chat session data to JSON or CSV format.
 * Supports filtering by channel, platform, and time range.
 */
@Injectable({
  providedIn: "root",
})
export class SessionExportService {
  private readonly chatStorageService = inject(ChatStorageService);

  /**
   * Export chat messages to file
   */
  export(options: ExportOptions): void {
    const messages = this.getFilteredMessages(options);

    let content: string;
    let mimeType: string;
    let extension: string;

    if (options.format === "json") {
      content = this.exportToJson(messages, options.includeMetadata ?? false);
      mimeType = "application/json";
      extension = "json";
    } else {
      content = this.exportToCsv(messages, options.includeMetadata ?? false);
      mimeType = "text/csv";
      extension = "csv";
    }

    this.downloadFile(content, mimeType, `unichat-export-${this.getTimestamp()}.${extension}`);
  }

  /**
   * Get filtered messages based on export options
   */
  private getFilteredMessages(options: ExportOptions): ChatMessage[] {
    let messages = this.chatStorageService.allMessages();

    // Filter by channels
    if (options.channels && options.channels.length > 0) {
      const channelSet = new Set(options.channels);
      messages = messages.filter((m) => channelSet.has(m.sourceChannelId));
    }

    // Filter by platforms
    if (options.platforms && options.platforms.length > 0) {
      const platformSet = new Set(options.platforms);
      messages = messages.filter((m) => platformSet.has(m.platform));
    }

    // Filter by time range
    if (options.startTime) {
      const start = new Date(options.startTime).getTime();
      messages = messages.filter((m) => new Date(m.timestamp).getTime() >= start);
    }
    if (options.endTime) {
      const end = new Date(options.endTime).getTime();
      messages = messages.filter((m) => new Date(m.timestamp).getTime() <= end);
    }

    // Sort chronologically (oldest first) for export
    return messages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Export messages to JSON format
   */
  private exportToJson(messages: ChatMessage[], includeMetadata: boolean): string {
    if (includeMetadata) {
      const exportData = {
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages,
      };
      return JSON.stringify(exportData, null, 2);
    }

    return JSON.stringify(messages, null, 2);
  }

  /**
   * Export messages to CSV format
   */
  private exportToCsv(messages: ChatMessage[], includeMetadata: boolean): string {
    const headers = ["Timestamp", "Platform", "Channel", "Author", "Message", "Badges"];

    if (includeMetadata) {
      headers.push(
        "Message ID",
        "Source User ID",
        "Source Channel ID",
        "Is Supporter",
        "Is Deleted"
      );
    }

    const rows = messages.map((m) => {
      const row = [
        this.escapeCsv(m.timestamp),
        this.escapeCsv(m.platform),
        this.escapeCsv(m.sourceChannelId),
        this.escapeCsv(m.author),
        this.escapeCsv(m.text.replace(/[\r\n]+/g, " ")), // Remove line breaks
        this.escapeCsv(m.badges.join(";")),
      ];

      if (includeMetadata) {
        row.push(
          this.escapeCsv(m.id),
          this.escapeCsv(m.sourceUserId),
          this.escapeCsv(m.sourceChannelId),
          String(m.isSupporter),
          String(m.isDeleted)
        );
      }

      return row.join(",");
    });

    return [headers.join(","), ...rows].join("\r\n");
  }

  /**
   * Escape CSV field (handle commas, quotes, newlines)
   */
  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Download content as file
   */
  private downloadFile(content: string, mimeType: string, filename: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Get timestamp for filename
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  /**
   * Get export preview (count of messages that would be exported)
   */
  getExportPreview(options: ExportOptions): { count: number; platforms: Record<string, number> } {
    const messages = this.getFilteredMessages(options);

    const platforms: Record<string, number> = {
      twitch: 0,
      kick: 0,
      youtube: 0,
    };

    for (const message of messages) {
      platforms[message.platform] = (platforms[message.platform] ?? 0) + 1;
    }

    return {
      count: messages.length,
      platforms,
    };
  }
}
