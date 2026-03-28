/**
 * Message Parser Worker Service
 *
 * Provides Web Worker-based message parsing for high-performance scenarios.
 * Falls back to main thread parsing for low-traffic scenarios.
 */

import { Injectable, OnDestroy } from "@angular/core";
import { ChatMessage } from "@models/chat.model";

interface ParsedMessage {
  text: string;
  segments: Array<{ type: string; value: string }>;
  emotes: Array<{ id: string; code: string }>;
  links: Array<{ url: string; text: string }>;
}

interface ParseOptions {
  sanitizeHtml: boolean;
  extractEmotes: boolean;
  extractLinks: boolean;
}

interface WorkerResponse {
  type: "parse-result" | "batch-parse-result" | "error";
  payload: {
    messageId?: string;
    result?: ParsedMessage;
    results?: Array<{ messageId: string; result: ParsedMessage }>;
    processingTime?: number;
    totalProcessingTime?: number;
    error?: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class MessageParserWorkerService implements OnDestroy {
  private worker: Worker | null = null;
  private isWorkerAvailable = false;
  private pendingRequests = new Map<string, (result: ParsedMessage) => void>();
  private pendingBatchRequests = new Map<
    string,
    (results: Array<{ messageId: string; result: ParsedMessage }>) => void
  >();
  private readonly workerThreshold = 10; // Use worker for batches > 10 messages

  constructor() {
    this.initializeWorker();
  }

  /**
   * Initialize Web Worker if available
   */
  private initializeWorker(): void {
    try {
      // Check if Web Workers are supported
      if (typeof Worker !== "undefined") {
        this.worker = new Worker(
          new URL("../../workers/message-parser.worker.ts", import.meta.url)
        );

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          this.handleWorkerMessage(event);
        };

        this.worker.onerror = (error) => {
          console.warn("[MessageParserWorker] Worker error, falling back to main thread:", error);
          this.isWorkerAvailable = false;
        };

        this.isWorkerAvailable = true;
        console.log("[MessageParserWorker] Worker initialized");
      } else {
        console.warn("[MessageParserWorker] Web Workers not supported, using main thread");
      }
    } catch (error) {
      console.warn("[MessageParserWorker] Failed to initialize worker:", error);
      this.isWorkerAvailable = false;
    }
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const { type, payload } = event.data;

    if (type === "parse-result" && payload.messageId && payload.result) {
      const resolve = this.pendingRequests.get(payload.messageId);
      if (resolve) {
        resolve(payload.result);
        this.pendingRequests.delete(payload.messageId);
      }
    } else if (type === "batch-parse-result" && payload.results) {
      const batchId = payload.results[0]?.messageId?.split("-batch-")[0];
      if (batchId) {
        const resolve = this.pendingBatchRequests.get(batchId);
        if (resolve) {
          resolve(payload.results);
          this.pendingBatchRequests.delete(batchId);
        }
      }
    } else if (type === "error") {
      console.warn("[MessageParserWorker] Worker error:", payload.error);
      this.isWorkerAvailable = false;
    }
  }

  /**
   * Parse a single message
   * Uses worker for high-traffic scenarios, main thread otherwise
   */
  async parseMessage(
    message: ChatMessage,
    options: ParseOptions = { sanitizeHtml: true, extractEmotes: true, extractLinks: true }
  ): Promise<ParsedMessage> {
    // For single messages, use main thread (faster for small workloads)
    return this.parseOnMainThread(message, options);
  }

  /**
   * Parse multiple messages in batch
   * Uses worker for large batches, main thread for small batches
   */
  async parseMessagesBatch(
    messages: ChatMessage[],
    options: ParseOptions = { sanitizeHtml: true, extractEmotes: true, extractLinks: true }
  ): Promise<Array<{ messageId: string; result: ParsedMessage }>> {
    if (this.isWorkerAvailable && messages.length > this.workerThreshold) {
      return this.parseOnWorker(messages, options);
    }

    return this.parseBatchOnMainThread(messages, options);
  }

  /**
   * Parse on main thread (fallback)
   */
  private parseOnMainThread(message: ChatMessage, options: ParseOptions): ParsedMessage {
    let text = message.text ?? "";
    const segments: Array<{ type: string; value: string }> = [];
    const emotes: Array<{ id: string; code: string }> = [];
    const links: Array<{ url: string; text: string }> = [];

    // Sanitize HTML
    if (options.sanitizeHtml) {
      text = this.escapeHtml(text);
    }

    // Extract links
    if (options.extractLinks) {
      links.push(...this.extractLinks(text));
    }

    // Extract emotes
    if (options.extractEmotes && message.rawPayload?.emotes) {
      emotes.push(
        ...message.rawPayload.emotes.map((emote) => ({
          id: emote.id,
          code: emote.code,
        }))
      );
    }

    segments.push({ type: "text", value: text });

    return { text, segments, emotes, links };
  }

  /**
   * Parse batch on main thread
   */
  private parseBatchOnMainThread(
    messages: ChatMessage[],
    options: ParseOptions
  ): Array<{ messageId: string; result: ParsedMessage }> {
    return messages.map((message) => ({
      messageId: message.id,
      result: this.parseOnMainThread(message, options),
    }));
  }

  /**
   * Parse on worker thread
   */
  private parseOnWorker(
    messages: ChatMessage[],
    options: ParseOptions
  ): Promise<Array<{ messageId: string; result: ParsedMessage }>> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not available"));
        return;
      }

      const batchId = `batch-${Date.now()}`;

      // Store first message ID as batch identifier
      this.pendingBatchRequests.set(batchId, resolve);

      this.worker.postMessage({
        type: "batch-parse",
        payload: { messages, options },
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingBatchRequests.has(batchId)) {
          this.pendingBatchRequests.delete(batchId);
          console.warn("[MessageParserWorker] Batch parse timeout, falling back to main thread");
          resolve(this.parseBatchOnMainThread(messages, options));
        }
      }, 5000);
    });
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
  }

  /**
   * Extract URLs from text
   */
  private extractLinks(text: string): Array<{ url: string; text: string }> {
    const links: Array<{ url: string; text: string }> = [];
    const urlRegex = /https?:\/\/[^\s<>"'()[\]]+|www\.[^\s<>"'()[\]]+/gi;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[0];
      links.push({
        url: url.startsWith("www.") ? `https://${url}` : url,
        text: url,
      });
    }

    return links;
  }

  /**
   * Check if worker is available
   */
  isWorkerReady(): boolean {
    return this.isWorkerAvailable;
  }

  /**
   * Get worker performance stats
   */
  getStats(): { isAvailable: boolean; pendingRequests: number } {
    return {
      isAvailable: this.isWorkerAvailable,
      pendingRequests: this.pendingRequests.size + this.pendingBatchRequests.size,
    };
  }

  /**
   * Terminate worker on service destruction
   */
  ngOnDestroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isWorkerAvailable = false;
    }
  }
}
